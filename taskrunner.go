package main

import (
	"context"
	"sync"
)

type Task interface {
	Run()
}

type TaskState struct {
	task Task
	id   string
	done chan struct{}
	d    *Dispatcher
}

func (t *TaskState) ID() string {
	return t.id
}

func (t *TaskState) WaitCh() <-chan struct{} {
	return t.done
}

func (t *TaskState) Run() {
	defer t.finish()
	t.task.Run()
}

func (t *TaskState) finish() {
	close(t.done)
	t.d.removeTaskState(t)
}

type Dispatcher struct {
	semaphoreCh chan struct{}
	taskCh      chan Task
	wg          sync.WaitGroup
	mutex       sync.RWMutex
	tasks       map[string]*TaskState
}

func NewDispatcher(maxGoroutines int, bufferLen int, start bool) *Dispatcher {
	d := &Dispatcher{
		semaphoreCh: make(chan struct{}, maxGoroutines),
		taskCh:      make(chan Task, bufferLen),
		tasks:       map[string]*TaskState{},
	}
	if start {
		d.Start(context.Background())
	}
	return d
}

func (d *Dispatcher) Start(ctx context.Context) {
	d.wg.Add(1)
	go func() {
		defer d.wg.Done()
		var wg sync.WaitGroup
		for {
			select {
			case <-ctx.Done():
				wg.Wait()
				return
			case task := <-d.taskCh:
				wg.Add(1)
				d.semaphoreCh <- struct{}{}
				go func() {
					defer wg.Done()
					defer func() { <-d.semaphoreCh }()
					task.Run()
				}()
			}
		}
	}()
}

func (d *Dispatcher) Wait() {
	d.wg.Wait()
}

func (d *Dispatcher) addTaskStateInternal(task Task, id string) (ts *TaskState, created bool) {
	if id == "" {
		return &TaskState{task, id, make(chan struct{}), d}, true
	}
	d.mutex.Lock()
	defer d.mutex.Unlock()

	if t, exists := d.tasks[id]; exists {
		return t, false
	}
	ts = &TaskState{task, id, make(chan struct{}), d}
	d.tasks[id] = ts
	return ts, true
}

func (d *Dispatcher) removeTaskState(task *TaskState) {
	d.mutex.Lock()
	defer d.mutex.Unlock()
	delete(d.tasks, task.ID())
}

func (d *Dispatcher) addTaskState(task Task, id string, block bool) *TaskState {
	ts, created := d.addTaskStateInternal(task, id)
	if !created {
		return ts
	}
	if block {
		d.taskCh <- ts
	} else {
		select {
		case d.taskCh <- ts:
		default:
			d.removeTaskState(ts)
			return nil
		}
	}
	return ts
}

func (d *Dispatcher) Add(task Task) *TaskState {
	return d.addTaskState(task, "", true)
}

func (d *Dispatcher) TryAdd(task Task) *TaskState {
	return d.addTaskState(task, "", false)
}

func (d *Dispatcher) TryAddWithId(task Task, id string) *TaskState {
	return d.addTaskState(task, id, false)
}

type taskFunc func()

func (f taskFunc) Run() {
	f()
}

func (d *Dispatcher) TryAddFunc(taskFn func(), id string) *TaskState {
	return d.addTaskState(taskFunc(taskFn), id, false)
}

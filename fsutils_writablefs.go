package main

import (
	"io"
	"io/fs"
	"os"
	"path"
)

type BasicFS interface {
	fs.StatFS
	fs.ReadDirFS
	fs.ReadFileFS
}

type writableDirFS struct {
	BasicFS
	path string
}

func NewWritableDirFS(path string) *writableDirFS {
	return &writableDirFS{BasicFS: os.DirFS(path).(BasicFS), path: path}
}

func (fsys *writableDirFS) OpenWriter(name string, flag int) (io.WriteCloser, error) {
	if !fs.ValidPath(name) {
		return nil, &fs.PathError{Op: "open", Path: name, Err: fs.ErrInvalid}
	}
	return os.OpenFile(path.Join(fsys.path, name), flag, fs.ModePerm)
}

func (fsys *writableDirFS) Truncate(name string, size int64) error {
	if !fs.ValidPath(name) {
		return &fs.PathError{Op: "truncate", Path: name, Err: fs.ErrInvalid}
	}
	return os.Truncate(path.Join(fsys.path, name), size)
}

func (fsys *writableDirFS) Remove(name string) error {
	if !fs.ValidPath(name) {
		return &fs.PathError{Op: "remove", Path: name, Err: fs.ErrInvalid}
	}
	return os.Remove(path.Join(fsys.path, name))
}

func (fsys *writableDirFS) Mkdir(name string, mode fs.FileMode) error {
	if !fs.ValidPath(name) {
		return &fs.PathError{Op: "mkdir", Path: name, Err: fs.ErrInvalid}
	}
	return os.Mkdir(path.Join(fsys.path, name), mode)
}

func (fsys *writableDirFS) Rename(name, newName string) error {
	if !fs.ValidPath(name) || !fs.ValidPath(newName) {
		return &fs.PathError{Op: "rename", Path: name, Err: fs.ErrInvalid}
	}
	return os.Rename(path.Join(fsys.path, name), path.Join(fsys.path, newName))
}

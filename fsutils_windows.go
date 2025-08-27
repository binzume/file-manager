//go:build windows

package main

import (
	"io"
	"io/fs"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

func VolumeNames() ([]string, error) {

	kernel32, _ := syscall.LoadLibrary("kernel32.dll")
	getLogicalDrivesHandle, _ := syscall.GetProcAddress(kernel32, "GetLogicalDrives")

	ret, _, err := syscall.SyscallN(uintptr(getLogicalDrivesHandle), 0, 0, 0, 0)

	if err != 0 {
		return nil, err
	}

	return bitsToDrives(uint32(ret)), nil
}

func bitsToDrives(bitMap uint32) (drives []string) {

	for i, drive := range "ABCDEFGHIJKLMNOPQRSTUVWXYZ" {
		if (bitMap>>i)&1 == 1 {
			drives = append(drives, string(drive)+":")
		}
	}

	return
}

type RootFs struct{}

type driveEntry struct {
	drive string
}

func (d *driveEntry) Name() string {
	return d.drive
}

func (d *driveEntry) IsDir() bool {
	return true
}

func (d *driveEntry) Info() (fs.FileInfo, error) {
	return d, nil
}

func (d *driveEntry) Type() fs.FileMode {
	return 1
}

func (d *driveEntry) Size() int64 {
	return 0
}

func (d *driveEntry) Mode() fs.FileMode {
	return fs.ModeDir
}

func (d *driveEntry) ModTime() time.Time {
	return time.Time{}
}

func (d *driveEntry) Sys() any {
	return nil
}

func NewRootFS() fs.FS {
	return &RootFs{}
}

func (r *RootFs) ResolveFS(name string) (*writableDirFS, string) {
	v := filepath.VolumeName(name)
	if v != "" {
		name = name[len(v):]
	}
	fs := NewWritableDirFS(v + "/")
	name = strings.TrimPrefix(name, "/")
	if name == "" {
		name = "."
	}
	return fs, name
}

func (r *RootFs) Open(name string) (fs.File, error) {
	fsys, name := r.ResolveFS(name)
	return fsys.Open(name)
}

func (r *RootFs) Stat(name string) (fs.FileInfo, error) {
	if name == "." || name == "/" {
		return &driveEntry{drive: name}, nil
	}
	fsys, name := r.ResolveFS(name)
	return fsys.Stat(name)
}

func (r *RootFs) ReadDir(name string) ([]fs.DirEntry, error) {
	if name == "." || name == "/" {
		volumes, err := VolumeNames()
		drives := []fs.DirEntry{}
		for _, v := range volumes {
			drives = append(drives, &driveEntry{drive: v})

		}
		return drives, err
	}

	fsys, name := r.ResolveFS(name)
	return fs.ReadDir(fsys, name)
}

func (r *RootFs) OpenWriter(name string, flag int) (io.WriteCloser, error) {
	fsys, name := r.ResolveFS(name)
	return fsys.OpenWriter(name, flag)
}

func (r *RootFs) Truncate(name string, size int64) error {
	fsys, name := r.ResolveFS(name)
	return fsys.Truncate(name, size)
}

func (r *RootFs) Remove(name string) error {
	fsys, name := r.ResolveFS(name)
	return fsys.Remove(name)
}

func (r *RootFs) Mkdir(name string, mode fs.FileMode) error {
	fsys, name := r.ResolveFS(name)
	return fsys.Mkdir(name, mode)
}

func (r *RootFs) Rename(name, newName string) error {
	fsys, name := r.ResolveFS(name)
	fsys2, newName := r.ResolveFS(newName)
	if fsys.path != fsys2.path {
		return &fs.PathError{Op: "rename", Path: name, Err: fs.ErrInvalid}
	}
	return fsys.Rename(name, newName)
}

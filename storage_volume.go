package main

import (
	"errors"
	"io"
	"io/fs"
	"strings"
)

type Capability uint32

const (
	Read     Capability = 1
	Write    Capability = 2
	Append   Capability = 4
	Truncate Capability = 8

	Create Capability = 16
	Mkdir  Capability = 32
	Remove Capability = 64
	Rename Capability = 128
	Stat   Capability = 256

	CapsInvalid = 32768
	CapReadOnly = Read | Stat
)

func (c Capability) ToStrings() []string {
	caps := []string{}
	if (c & Read) != 0 {
		caps = append(caps, "read")
	}
	if (c & Read) != 0 {
		caps = append(caps, "write")
	}
	if (c & Append) != 0 {
		caps = append(caps, "append")
	}
	if (c & Remove) != 0 {
		caps = append(caps, "remove")
	}
	if (c & Rename) != 0 {
		caps = append(caps, "rename")
	}
	if (c & Truncate) != 0 {
		caps = append(caps, "truncate")
	}
	if (c & Stat) != 0 {
		caps = append(caps, "stat")
	}
	return caps
}

func (c Capability) ToString() string {
	return strings.Join(c.ToStrings(), ",")
}

var ErrInvalidOp = errors.New("invalid operation")

type Volume interface {
	fs.StatFS
	OpenWriterFS
	RemoveFS
	RenameFS
	MkdirFS
	TruncateFS
}

type volumeWrapper struct {
	fs.FS
	StatFS       fs.StatFS
	OpenWriterFS OpenWriterFS
	RemoveFS     RemoveFS
	RenameFS     RenameFS
	MkdirFS      MkdirFS
	OpenDirFS    OpenDirFS
	TruncateFS   TruncateFS

	caps Capability
}

func WrapVolume(fsys fs.FS) Volume {
	if v, ok := fsys.(Volume); ok {
		return v
	}
	v := volumeWrapper{FS: fsys, caps: CapsInvalid}
	v.StatFS, _ = fsys.(fs.StatFS)
	v.OpenWriterFS, _ = fsys.(OpenWriterFS)
	v.RemoveFS, _ = fsys.(RemoveFS)
	v.RenameFS, _ = fsys.(RenameFS)
	v.MkdirFS, _ = fsys.(MkdirFS)
	v.OpenDirFS, _ = fsys.(OpenDirFS)
	v.TruncateFS, _ = fsys.(TruncateFS)
	return &v
}

func (v *volumeWrapper) Readonly() Volume {
	return &volumeWrapper{FS: v.FS, StatFS: v.StatFS, OpenDirFS: v.OpenDirFS}
}

func (v *volumeWrapper) Caps() Capability {
	if v.caps != CapsInvalid {
		return v.caps
	}

	var caps Capability = 0
	if v.StatFS != nil {
		caps |= Stat
	}
	if v.OpenWriterFS != nil {
		caps |= Write
	}
	if v.RemoveFS != nil {
		caps |= Remove
	}
	if v.RenameFS != nil {
		caps |= Rename
	}
	if v.MkdirFS != nil {
		caps |= Mkdir
	}
	if v.OpenDirFS != nil {
		caps |= Read
	}
	if v.TruncateFS != nil {
		caps |= Truncate
	}
	v.caps = caps
	return v.caps
}

func (s *volumeWrapper) Stat(name string) (fs.FileInfo, error) {
	if s.StatFS == nil {
		return nil, ErrInvalidOp
	}
	return s.StatFS.Stat(name)
}

func (s *volumeWrapper) OpenWriter(name string, flag int) (io.WriteCloser, error) {
	if s.OpenWriterFS == nil {
		return nil, ErrInvalidOp
	}
	return s.OpenWriterFS.OpenWriter(name, flag)
}

func (s *volumeWrapper) OpenDir(name string) (fs.ReadDirFile, error) {
	if s.OpenDirFS == nil {
		return nil, ErrInvalidOp
	}
	return s.OpenDirFS.OpenDir(name)
}

func (s *volumeWrapper) Remove(name string) error {
	if s.RemoveFS == nil {
		return ErrInvalidOp
	}
	return s.RemoveFS.Remove(name)
}

func (s *volumeWrapper) Rename(name string, newName string) error {
	if s.RenameFS == nil {
		return ErrInvalidOp
	}
	return s.RenameFS.Rename(name, newName)
}

func (s *volumeWrapper) Mkdir(name string, mode fs.FileMode) error {
	if s.MkdirFS == nil {
		return ErrInvalidOp
	}
	return s.MkdirFS.Mkdir(name, mode)
}

func (s *volumeWrapper) Truncate(name string, size int64) error {
	if s.TruncateFS == nil {
		return ErrInvalidOp
	}
	return s.TruncateFS.Truncate(name, size)
}

func (s *volumeWrapper) ReadDir(name string) ([]fs.DirEntry, error) {
	return fs.ReadDir(s.FS, name)
}

func Caps(v fs.FS) Capability {
	if c, ok := v.(interface{ Caps() Capability }); ok {
		return c.Caps()
	}
	var caps Capability = Read

	if _, ok := v.(fs.StatFS); ok {
		caps |= Stat
	}
	if _, ok := v.(OpenWriterFS); ok {
		caps |= Write
	}
	if _, ok := v.(RemoveFS); ok {
		caps |= Remove
	}
	if _, ok := v.(RenameFS); ok {
		caps |= Rename
	}
	if _, ok := v.(MkdirFS); ok {
		caps |= Mkdir
	}
	if _, ok := v.(TruncateFS); ok {
		caps |= Truncate
	}
	return caps
}

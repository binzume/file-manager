package main

import (
	"io"
	"io/fs"
)

// An interface for opening files for writing.
type OpenWriterFS interface {
	fs.FS
	OpenWriter(name string, flag int) (io.WriteCloser, error)
}

// An interface to remove file or directory from the file system.
type RemoveFS interface {
	fs.FS
	Remove(name string) error
}

// An interface to rename file or directory from the file system.
type RenameFS interface {
	fs.FS
	Rename(name string, newName string) error
}

// An interface to make new directories in the file system.
type MkdirFS interface {
	fs.FS
	Mkdir(name string, mode fs.FileMode) error
}

// An interface for preferentially opening ReadDirFile.
// If OpenDirFS is not implemented, try using fs.ReadDirFS, then Open file and try using fs.ReadDirFile.
type OpenDirFS interface {
	fs.FS
	OpenDir(name string) (fs.ReadDirFile, error)
}

// An interface to truncate file to specified size.
// If TruncateFS is not implemented, open file and try using file.Truncate(size).
type TruncateFS interface {
	fs.FS
	Truncate(name string, size int64) error
}

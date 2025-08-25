//go:build !windows

package main

import (
	"io/fs"
)

func VolumeNames() ([]string, error) {
	return []string{""}, nil
}

func NewRootFS() fs.FS {
	return NewWritableDirFS("/")
}

package main

import (
	"io/fs"
	"log"
	"mime"
	"path"
	"path/filepath"
	"strings"
)

// well known types
var contentTypes = map[string]string{
	// video
	".mp4":  "video/mp4",
	".m4v":  "video/mp4",
	".f4v":  "video/mp4",
	".webm": "video/webm",
	".ogv":  "video/ogv",

	// image
	".jpeg": "image/jpeg",
	".jpg":  "image/jpeg",
	".gif":  "image/gif",
	".png":  "image/png",
	".bmp":  "image/bmp",
	".webp": "image/webp",
	".svg":  "image/svg+xml",

	// audio
	".aac": "audio/aac",
	".mp3": "audio/mp3",
	".ogg": "audio/ogg",
	".mid": "audio/midi",

	".zip": "archive",
}

var UnsafeMimeTypeReplace = map[string]string{
	"text/html":     "text/plain",
	"text/xml":      "text/plain",
	"image/svg+xml": "text/plain",
}

func MimeTypeByName(name string) string {
	ext := strings.ToLower(filepath.Ext(name))
	if typ, ok := contentTypes[ext]; ok {
		return typ
	}
	return mime.TypeByExtension(ext)
}

type FileInfo struct {
	Name        string    `json:"name"`
	MimeType    string    `json:"type"`
	Size        int64     `json:"size"`
	UpdatedTime int64     `json:"updatedTime"`
	Thumbnail   *FileInfo `json:"thumbnail,omitempty"`
	Tags        []string  `json:"tags,omitempty"`
}

type FolderMetadata struct {
	Name       string   `json:"name"`
	Caps       []string `json:"caps"`
	TotalCount int      `json:"files"`
}

type FileList struct {
	Items  []*FileInfo    `json:"items"`
	Next   *int           `json:"next"`
	Folder FolderMetadata `json:"folder"`
}

type Storage struct {
	v    Volume
	caps Capability
}

func NewStorage(v fs.FS) *Storage {
	return &Storage{v: WrapVolume(v), caps: CapsInvalid}
}

func (s *Storage) Caps(path string) Capability {
	if s.caps == CapsInvalid {
		s.caps = Caps(s.v)
	}
	stat, err := s.v.Stat(path)
	if err != nil || (stat.Mode()&0200) == 0 {
		if err == nil {
			log.Println("READONLY", path, stat.Mode())
		} else {
			log.Println("ERR", path, err)
		}
		return s.caps & CapReadOnly
	}
	return s.caps
}

func GetMimeType(f fs.DirEntry) string {
	if f.IsDir() {
		return "folder" // TODO: x-folder
	}
	return ""
}

func ToFileInfo(f fs.DirEntry) *FileInfo {
	info, err := f.Info()
	mimeType := ""
	if f.IsDir() {
		mimeType = "folder" // TODO application/x-folder+json
	} else {
		mimeType = MimeTypeByName(f.Name())
	}
	if err != nil {
		return &FileInfo{
			Name:     f.Name(),
			MimeType: mimeType,
		}
	}

	if f.IsDir() {
		return &FileInfo{
			Name:        f.Name(),
			MimeType:    mimeType,
			UpdatedTime: info.ModTime().UnixMilli(),
		}
	}

	return &FileInfo{
		Name:        info.Name(),
		MimeType:    mimeType,
		Size:        info.Size(),
		UpdatedTime: info.ModTime().UnixMilli(),
	}
}

func safeSlice[T any](items []T, offset, limit int) []T {
	if offset >= len(items) {
		return []T{}
	}
	last := offset + limit
	if last > len(items) || limit < 0 {
		last = len(items)
	}
	return items[offset:last]
}

func (s *Storage) Files(dir string, offset, limit int) (*FileList, error) {
	files, err := fs.ReadDir(s.v, dir)
	if err != nil {
		return nil, err
	}

	name := path.Base(dir)
	total := len(files)

	files = safeSlice(files, offset, limit)

	items := []*FileInfo{}
	for _, f := range files {
		f.IsDir()
		items = append(items, ToFileInfo(f))
	}

	nextOffset := offset + limit
	var next *int = nil
	if total > nextOffset && limit > 0 {
		next = &(nextOffset)
	}

	return &FileList{
		Items:  items,
		Next:   next,
		Folder: FolderMetadata{Name: name, TotalCount: total, Caps: s.Caps(dir).ToStrings()},
	}, nil
}

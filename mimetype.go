package main

import (
	"mime"
	"path"
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

func MimeTypeByFilename(name string) string {
	ext := strings.ToLower(path.Ext(name))
	if typ, ok := contentTypes[ext]; ok {
		return typ
	}
	return mime.TypeByExtension(ext)
}

func ParseMimeType(mimeType string) []string {
	return strings.FieldsFunc(mimeType, func(r rune) bool {
		return r == '/' || r == ';'
	})
}

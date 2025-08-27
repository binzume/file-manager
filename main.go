package main

import (
	"embed"
	"log"
	"net/http"
	"time"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/src
var assets embed.FS

type FileLoader struct {
	http.Handler
	app *App
}

func (h *FileLoader) ServeHTTP(res http.ResponseWriter, req *http.Request) {
	filePath := req.URL.Query().Get("download")
	log.Println(filePath)
	if filePath == "" {
		return
	}

	if req.URL.Query().Get("mode") == "thumbnail" {
		config := &ThumbnailConfig{CacheDir: ".file_manager_cache"}
		select {
		case cachePath := <-RequestThumbnail(h.app.storage.v, "image", filePath, "", config):
			if cachePath != "" {
				res.Header().Set("content-type", "image/jpeg")
				http.ServeFile(res, req, cachePath)
				return
			}
		case <-time.After(15 * time.Second):
		}

		return
	}

	res.Header().Set("content-type", MimeTypeByFilename(filePath))
	http.ServeFileFS(res, req, h.app.storage.v, filePath)
}

func main() {
	path := "/"
	// Create an instance of the app structure
	app := NewApp(path)

	// Create application with options
	err := wails.Run(&options.App{
		Title:  "file-manager",
		Width:  1024,
		Height: 768,
		AssetServer: &assetserver.Options{
			Assets:  assets,
			Handler: &FileLoader{app: app},
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}

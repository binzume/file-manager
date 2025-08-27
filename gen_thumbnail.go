package main

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"errors"
	"image"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"io"
	"log"
	"net"
	"net/url"
	"os"
	"os/exec"
	"path"
	"strings"
	"sync"
	"time"

	_ "golang.org/x/image/bmp"
	_ "golang.org/x/image/webp"

	"github.com/nfnt/resize"
)

type ThumbnailConfig struct {
	CacheDir   string
	FFmpegPath string `toml:"ffmpegPath"`
}

var thumbnailTaskDispatcher = NewDispatcher(8, 16, true)

func hash(s string) string {
	h := md5.New()
	h.Write([]byte(s))
	return hex.EncodeToString(h.Sum(nil))
}

func RequestThumbnail(v Volume, srcType, srcPath, cacheID string, conf *ThumbnailConfig) chan string {
	result := make(chan string, 1)
	once := sync.Once{}
	defer once.Do(func() { close(result) })

	if cacheID == "" {
		cacheID = hash(srcPath)
	}

	os.MkdirAll(conf.CacheDir, os.ModePerm)

	cachePath := path.Join(conf.CacheDir, cacheID+".jpeg")
	if _, err := os.Stat(cachePath); err == nil {
		result <- cachePath
		return result
	}

	if srcType != "image" && srcType != "video" && srcType != "archive" {
		return result
	}

	taskFun := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10000*time.Millisecond)
		defer cancel()
		err := MakeThumbnail(ctx, v, srcType, srcPath, cachePath, conf)
		if err != nil {
			log.Println("Failed to generate thumbnail ", err)
		}
	}
	if task := thumbnailTaskDispatcher.TryAddFunc(taskFun, cachePath); task != nil {
		once.Do(func() {}) // close in goroutine
		go func() {
			defer close(result)
			<-task.WaitCh()
			if _, err := os.Stat(cachePath); err == nil {
				result <- cachePath
			}
		}()
		return result
	}

	log.Println("busy ", cachePath)
	return result
}

func MakeThumbnail(ctx context.Context, v Volume, srcType, srcPath, cachePath string, conf *ThumbnailConfig) error {
	if v == nil {
		if srcType == "video" {
			return makeVideoThumbnail(ctx, srcPath, cachePath, conf)
		}
		return errors.New("not supporetd volume type")
	}

	log.Println("Generating thumbnail... ", srcPath)
	if srcType == "video" {
		if rv, ok := v.(interface{ RealPath(string) string }); ok {
			return makeVideoThumbnail(ctx, rv.RealPath(srcPath), cachePath, conf)
		}
	} else {
		in, err := v.Open(srcPath)
		if err != nil {
			return err
		}
		defer in.Close()
		return makeImageThumbnail(ctx, in, cachePath)
	}
	return errors.New("not supporetd volume type")
}

func makeVideoThumbnail(ctx context.Context, in, out string, conf *ThumbnailConfig) error {
	if conf.FFmpegPath == "" {
		log.Println("MakeVideoThumbnail: FFmpegPath is not configured")
		return errors.New("MakeVideoThumbnail: conf.FFmpegPath")
	}
	args := []string{"-ss", "3", "-i", in, "-vframes", "1", "-vcodec", "mjpeg", "-an", "-vf", "scale=200:-1", out}
	if strings.HasPrefix(in, "https://") || strings.HasPrefix(in, "http://") {
		// To prevent hostname resolving issue
		if parsedURL, err := url.Parse(in); err == nil {
			log.Println("Resolve hostname...", parsedURL.Host)
			if addrs, err := net.LookupHost(parsedURL.Host); err == nil {
				hostHeader := "Host: " + parsedURL.Host
				parsedURL.Host = addrs[0]
				args[3] = parsedURL.String()
				args = append([]string{"-headers", hostHeader}, args...)
			}
		}
	}
	c := exec.CommandContext(ctx, conf.FFmpegPath, args...)
	err := c.Start()
	if err != nil {
		log.Println(conf.FFmpegPath, args)
		return nil
	}
	err = c.Wait()
	_, err2 := os.Stat(out)
	if err == nil && err2 != nil {
		log.Println("RETRY ", conf.FFmpegPath, "-i", in, "-vframes", "1",
			"-vcodec", "mjpeg", "-an", "-vf", "scale=200:-1", out)
		// TODO
		c := exec.CommandContext(ctx, conf.FFmpegPath, "-i", in, "-vframes", "1",
			"-vcodec", "mjpeg", "-an", "-vf", "scale=200:-1", out)
		_ = c.Start()
		err = c.Wait()
	}
	return err
}

func makeImageThumbnail(_ context.Context, in io.Reader, out string) error {
	img, _, err := image.Decode(in)
	if err != nil {
		return err
	}

	timg := resize.Resize(160, 0, img, resize.Lanczos3)

	thumb, err := os.Create(out)
	if err != nil {
		return err
	}
	defer thumb.Close()
	return jpeg.Encode(thumb, timg, nil)
}

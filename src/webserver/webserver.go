// Package webserver
// Created by RTT.
// Author: teocci@yandex.com on 2022-Apr-26
package webserver

import (
	"embed"
	"fmt"
	"log"
	"mime"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/teocci/go-bio-evo/src/config"
)

const (
	formatAddress = "%s:%d"
)

var (
	f       embed.FS
	address string
)

func Start() {
	address = fmt.Sprintf(formatAddress, "", config.Data.Web.Port)
	gin.SetMode(gin.ReleaseMode)
	_ = mime.AddExtensionType(".js", "application/javascript")

	router := gin.Default()
	router.LoadHTMLGlob("web/templates/*")

	router.StaticFS("/css", http.Dir("web/static/css"))
	router.StaticFS("/js", http.Dir("web/static/js"))
	router.StaticFS("/img", http.Dir("web/static/img"))
	router.StaticFile("/page.html", "web/static/page.html")

	router.Use(CORSMiddleware())
	fmt.Printf("address : %v", address)
	err := router.Run(address)
	if err != nil {
		log.Fatalln("Start HTTP Server error", err)
	}
}

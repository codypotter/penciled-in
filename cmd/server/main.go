// Command server serves the generated site in public/ for local development.
package main

import (
	"flag"
	"log"
	"net/http"
)

func main() {
	addr := flag.String("addr", ":8080", "listen address")
	flag.Parse()

	log.Printf("Penciled In on http://localhost%s", *addr)
	log.Fatal(http.ListenAndServe(*addr, http.FileServer(http.Dir("public"))))
}

// Command generate writes the static site and puzzle packs into public/.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/rand/v2"
	"os"
	"path/filepath"
	"sync"
	"time"

	"ninefold/internal/sudoku"
	"ninefold/internal/templates"
)

type puzzle struct {
	ID string `json:"id"`
	P  string `json:"p"`
	S  string `json:"s"`
}

func main() {
	count := flag.Int("n", 300, "puzzles per difficulty")
	out := flag.String("out", "public", "output directory")
	puzzles := flag.Bool("puzzles", true, "regenerate puzzle packs (skipped if they exist and false)")
	flag.Parse()

	if err := writePage(*out); err != nil {
		log.Fatal(err)
	}
	for _, d := range []sudoku.Difficulty{sudoku.Easy, sudoku.Medium, sudoku.Hard} {
		path := filepath.Join(*out, "puzzles", d.String()+".json")
		if _, err := os.Stat(path); err == nil && !*puzzles {
			continue
		}
		if err := writePack(path, d, *count); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("wrote %s\n", path)
	}
}

func writePage(out string) error {
	f, err := os.Create(filepath.Join(out, "index.html"))
	if err != nil {
		return err
	}
	defer f.Close()
	return templates.Index().Render(context.Background(), f)
}

func writePack(path string, d sudoku.Difficulty, n int) error {
	packs := make([]puzzle, n)
	var wg sync.WaitGroup
	sem := make(chan struct{}, 8)
	seed := uint64(time.Now().UnixNano())
	for i := range packs {
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			rng := rand.New(rand.NewPCG(seed, uint64(i)))
			p, s := sudoku.Generate(rng, d)
			packs[i] = puzzle{ID: fmt.Sprintf("%s-%04d", d, i), P: p.String(), S: s.String()}
		}()
	}
	wg.Wait()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	b, err := json.Marshal(packs)
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o644)
}

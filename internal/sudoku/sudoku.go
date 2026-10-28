// Package sudoku implements a solver, puzzle generator and difficulty grader.
package sudoku

import (
	"fmt"
	"math/bits"
	"math/rand/v2"
	"strings"
)

// Grid holds 81 cells in row-major order; 0 means empty.
type Grid [81]uint8

// Parse reads an 81-character string where '0' or '.' is an empty cell.
func Parse(s string) (Grid, error) {
	var g Grid
	if len(s) != 81 {
		return g, fmt.Errorf("want 81 cells, got %d", len(s))
	}
	for i, c := range s {
		switch {
		case c == '.' || c == '0':
		case c >= '1' && c <= '9':
			g[i] = uint8(c - '0')
		default:
			return g, fmt.Errorf("bad cell %q at %d", c, i)
		}
	}
	return g, nil
}

func (g Grid) String() string {
	var b strings.Builder
	for _, v := range g {
		b.WriteByte('0' + v)
	}
	return b.String()
}

func (g Grid) Clues() int {
	n := 0
	for _, v := range g {
		if v != 0 {
			n++
		}
	}
	return n
}

// peers[i] lists the 20 cells sharing a row, column or box with cell i.
var peers [81][20]int

// units holds the 27 rows, columns and boxes.
var units [27][9]int

func init() {
	for r := 0; r < 9; r++ {
		for c := 0; c < 9; c++ {
			i := r*9 + c
			n := 0
			for j := 0; j < 81; j++ {
				if j == i {
					continue
				}
				jr, jc := j/9, j%9
				if jr == r || jc == c || (jr/3 == r/3 && jc/3 == c/3) {
					peers[i][n] = j
					n++
				}
			}
		}
	}
	for k := 0; k < 9; k++ {
		for n := 0; n < 9; n++ {
			units[k][n] = k*9 + n
			units[9+k][n] = n*9 + k
			units[18+k][n] = (k/3*3+n/3)*9 + k%3*3 + n%3
		}
	}
}

const all = 0x1FF // candidate mask: bit d-1 set means digit d is possible

// candidates returns the candidate mask for every empty cell (0 for filled cells).
func (g *Grid) candidates() [81]uint16 {
	var m [81]uint16
	for i := range g {
		if g[i] != 0 {
			continue
		}
		used := uint16(0)
		for _, p := range peers[i] {
			if g[p] != 0 {
				used |= 1 << (g[p] - 1)
			}
		}
		m[i] = all &^ used
	}
	return m
}

// valid reports whether the givens contain no duplicates in any unit.
func (g *Grid) valid() bool {
	for _, u := range units {
		var seen uint16
		for _, i := range u {
			if g[i] == 0 {
				continue
			}
			b := uint16(1) << (g[i] - 1)
			if seen&b != 0 {
				return false
			}
			seen |= b
		}
	}
	return true
}

// CountSolutions counts solutions, stopping once limit is reached.
func CountSolutions(g Grid, limit int) int {
	if !g.valid() {
		return 0
	}
	n := 0
	search(&g, nil, func(Grid) bool {
		n++
		return n < limit
	})
	return n
}

// Solve returns one solution, if any exists.
func Solve(g Grid) (Grid, bool) {
	var out Grid
	found := false
	if g.valid() {
		search(&g, nil, func(s Grid) bool { out, found = s, true; return false })
	}
	return out, found
}

// search enumerates solutions by backtracking on the most constrained cell.
// It calls yield for each; yield returns false to stop. rng, if non-nil,
// randomizes digit order. It returns false if stopped early.
func search(g *Grid, rng *rand.Rand, yield func(Grid) bool) bool {
	m := g.candidates()
	best, bestN := -1, 10
	for i, g := range g {
		if g != 0 {
			continue
		}
		n := bits.OnesCount16(m[i])
		if n == 0 {
			return true
		}
		if n < bestN {
			best, bestN = i, n
		}
	}
	if best < 0 {
		return yield(*g)
	}
	digits := make([]uint8, 0, 9)
	for d := uint8(1); d <= 9; d++ {
		if m[best]&(1<<(d-1)) != 0 {
			digits = append(digits, d)
		}
	}
	if rng != nil {
		rng.Shuffle(len(digits), func(a, b int) { digits[a], digits[b] = digits[b], digits[a] })
	}
	for _, d := range digits {
		g[best] = d
		if !search(g, rng, yield) {
			g[best] = 0
			return false
		}
	}
	g[best] = 0
	return true
}

// Difficulty is graded by the simplest techniques that solve the puzzle.
type Difficulty int

const (
	Easy   Difficulty = iota // solvable with naked singles alone
	Medium                   // needs hidden singles too
	Hard                     // needs more than singles
)

func (d Difficulty) String() string { return [...]string{"easy", "medium", "hard"}[d] }

// Grade rates a puzzle by trying to solve it with singles only.
func Grade(g Grid) Difficulty {
	if singlesSolve(g, false) {
		return Easy
	}
	if singlesSolve(g, true) {
		return Medium
	}
	return Hard
}

// singlesSolve applies naked singles (and hidden singles if hidden) until stuck.
func singlesSolve(g Grid, hidden bool) bool {
	for {
		m := g.candidates()
		progress := false
		for i := range g {
			if g[i] == 0 && bits.OnesCount16(m[i]) == 1 {
				g[i] = uint8(bits.TrailingZeros16(m[i]) + 1)
				progress = true
				m = g.candidates()
			}
		}
		if hidden && !progress {
			for _, u := range units {
				for d := 0; d < 9; d++ {
					cell, n := -1, 0
					for _, i := range u {
						if m[i]&(1<<d) != 0 {
							cell, n = i, n+1
						}
					}
					if n == 1 {
						g[cell] = uint8(d + 1)
						m = g.candidates()
						progress = true
					}
				}
			}
		}
		if !progress {
			break
		}
	}
	return g.Clues() == 81
}

// Generate returns a uniquely solvable puzzle of the target difficulty along
// with its solution. It retries until one of exactly that difficulty is found.
func Generate(rng *rand.Rand, target Difficulty) (puzzle, solution Grid) {
	for {
		var empty Grid
		var full Grid
		search(&empty, rng, func(s Grid) bool { full = s; return false })

		p := full
		order := rng.Perm(81)
		for _, i := range order {
			v := p[i]
			p[i] = 0
			if CountSolutions(p, 2) != 1 || Grade(p) > target {
				p[i] = v
			}
		}
		if Grade(p) == target {
			return p, full
		}
	}
}

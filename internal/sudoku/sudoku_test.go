package sudoku

import (
	"math/rand/v2"
	"testing"
)

func TestSolveKnown(t *testing.T) {
	g, err := Parse("530070000600195000098000060800060003400803001700020006060000280000419005000080079")
	if err != nil {
		t.Fatal(err)
	}
	s, ok := Solve(g)
	if !ok {
		t.Fatal("no solution")
	}
	want := "534678912672195348198342567859761423426853791713924856961537284287419635345286179"
	if s.String() != want {
		t.Fatalf("got %s", s)
	}
	if n := CountSolutions(g, 2); n != 1 {
		t.Fatalf("want unique, got %d", n)
	}
}

func TestGenerate(t *testing.T) {
	rng := rand.New(rand.NewPCG(1, 2))
	for _, d := range []Difficulty{Easy, Medium, Hard} {
		p, s := Generate(rng, d)
		if CountSolutions(p, 2) != 1 {
			t.Fatalf("%v: not unique", d)
		}
		if got, _ := Solve(p); got != s {
			t.Fatalf("%v: solution mismatch", d)
		}
		if Grade(p) != d {
			t.Fatalf("%v: graded %v", d, Grade(p))
		}
		t.Logf("%v: %d clues", d, p.Clues())
	}
}

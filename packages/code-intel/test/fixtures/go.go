package main

type Greeter struct{}

func (g *Greeter) Greet(name string) string {
	return "hi " + name
}

func main() {}

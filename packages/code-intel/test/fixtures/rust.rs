use std::io;

struct Greeter {}

impl Greeter {
    fn greet(&self, name: &str) -> String {
        format!("hi {}", name)
    }
}

fn hello() -> Greeter {
    Greeter {}
}

# Inspect a stored definition

Enter `#print name` to display a session definition's inferred type and stored
Core term without normalizing its body. Definitions and theorem proofs are both
supported:

```text
def one := Succ 0
#print one
one : Nat := (Succ 0)
```

The command is read-only. It accepts one name from the current environment;
built-in syntax such as `Nat` is not a stored definition. Global references have
already been elaborated when a definition is stored, so the displayed Core term
is not a copy of the original source text.

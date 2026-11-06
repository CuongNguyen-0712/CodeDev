// @piece lex: Helper: split a command line into words and operators
function lex(command: string): Token[] | Rule {
    const tokens: Token[] = [];
    let word = "";
    let inWord = false;
    const endWord = () => {
        if (inWord) tokens.push({ kind: "word", value: word });
        word = "";
        inWord = false;
    };
    let i = 0;
    while (i < command.length) {
        const ch = command[i];
        if (ch === " " || ch === "\t") {
            endWord();
            i++;
            continue;
        }
        const op = OPERATORS.find((o) => command.startsWith(o, i));
        if (op) {
            endWord();
            tokens.push({ kind: "op", value: op });
            i += op.length;
            continue;
        }
        if (ch === "`" || (ch === "$" && command[i + 1] === "(")) return "command-substitution";
        inWord = true;
        if (ch === "\\") {
            if (i + 1 >= command.length) return "parse-error";
            word += command[i + 1];
            i += 2;
        } else if (ch === "'") {
            const end = command.indexOf("'", i + 1);
            if (end === -1) return "parse-error";
            word += command.slice(i + 1, end);
            i = end + 1;
        } else if (ch === '"') {
            i++;
            for (;;) {
                if (i >= command.length) return "parse-error";
                const c = command[i];
                if (c === '"') break;
                // inside double quotes everything is treated as text
                if (c === "\\") {
                    if (i + 1 >= command.length) return "parse-error";
                    word += command[i + 1];
                    i += 2;
                } else {
                    word += c;
                    i++;
                }
            }
            i++;
        } else {
            word += ch;
            i++;
        }
    }
    endWord();
    return tokens;
}

// @piece compare-code: Turn code into comparable n-grams
const tokens = (source: string): string[] => {
    const code = source.replace(/\/\*[\s\S]*?(\*\/|$)/g, " ").replace(/\/\/[^\n]*/g, " ");
    return (code.match(/[A-Za-z0-9_$]+|\S/g) ?? []);
};

const ngrams = (list: string[]): Set<string> => {
    const out = new Set<string>();
    for (let i = 0; i + NGRAM <= list.length; i++) out.add(list.slice(i, i + NGRAM).join(" "));
    return out;
};

// Prism light build with only the grammars lesson content and the editor use (content/courses,
// codeEditor LANGUAGE_ICONS). The full `Prism` build ships every grammar Prism has to each page.
// An unregistered language renders as plain text.
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { refractor } from "refractor/core";

import { syntaxTheme } from "@/lib/syntaxTheme";

import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import c from "react-syntax-highlighter/dist/esm/languages/prism/c";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import csharp from "react-syntax-highlighter/dist/esm/languages/prism/csharp";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import diff from "react-syntax-highlighter/dist/esm/languages/prism/diff";
import docker from "react-syntax-highlighter/dist/esm/languages/prism/docker";
import elixir from "react-syntax-highlighter/dist/esm/languages/prism/elixir";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import graphql from "react-syntax-highlighter/dist/esm/languages/prism/graphql";
import haskell from "react-syntax-highlighter/dist/esm/languages/prism/haskell";
import http from "react-syntax-highlighter/dist/esm/languages/prism/http";
import ini from "react-syntax-highlighter/dist/esm/languages/prism/ini";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import kotlin from "react-syntax-highlighter/dist/esm/languages/prism/kotlin";
import lua from "react-syntax-highlighter/dist/esm/languages/prism/lua";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import nginx from "react-syntax-highlighter/dist/esm/languages/prism/nginx";
import php from "react-syntax-highlighter/dist/esm/languages/prism/php";
import powershell from "react-syntax-highlighter/dist/esm/languages/prism/powershell";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import ruby from "react-syntax-highlighter/dist/esm/languages/prism/ruby";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import scss from "react-syntax-highlighter/dist/esm/languages/prism/scss";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import toml from "react-syntax-highlighter/dist/esm/languages/prism/toml";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";

const LANGUAGES = {
    bash, c, cpp, csharp, css, diff, docker, dockerfile: docker, elixir, go, graphql, haskell,
    html: markup, http, ini, java, javascript, json, jsx, kotlin, lua, markdown, markup, nginx,
    php, powershell, python, ruby, rust, scss, sql, toml, tsx, typescript, xml: markup, yaml,
};

for (const [name, grammar] of Object.entries(LANGUAGES)) SyntaxHighlighter.registerLanguage(name, grammar);

export { SyntaxHighlighter };

// The coding editor re-highlights on every keystroke. Building one HTML string from the same
// Prism tokens and theme costs a fraction of rendering thousands of React elements per key.
const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
const escapeHtml = (text) => text.replace(/[&<>]/g, (ch) => ESCAPES[ch]);
const cssName = (key) => key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);

const styleCache = new Map();
function tokenStyle(classNames) {
    const key = classNames.join(" ");
    let style = styleCache.get(key);
    if (style === undefined) {
        const merged = Object.assign({}, ...classNames.map((name) => syntaxTheme[name] || {}));
        style = Object.entries(merged).map(([prop, value]) => `${cssName(prop)}:${value}`).join(";");
        styleCache.set(key, style);
    }
    return style;
}

function toHtml(nodes) {
    let html = "";
    for (const node of nodes) {
        if (node.type === "text") {
            html += escapeHtml(node.value);
        } else if (node.type === "element") {
            const style = tokenStyle(node.properties?.className || []);
            html += `<span${style ? ` style="${style}"` : ""}>${toHtml(node.children)}</span>`;
        }
    }
    return html;
}

/**
 * `code` as HTML with the theme as inline styles (same colours as SyntaxHighlighter). Text is
 * escaped and styles come only from lib/syntaxTheme, so the result is safe for innerHTML.
 * An unregistered language comes back as escaped plain text.
 */
export function highlightToHtml(code, language) {
    const text = String(code ?? "");
    if (!language || !refractor.registered(language)) return escapeHtml(text);
    return toHtml(refractor.highlight(text, language).children);
}

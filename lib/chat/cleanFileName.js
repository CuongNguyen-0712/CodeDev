// C0, DEL, C1 and the bidi controls (LRM/RLM, embeddings/overrides, isolates): "invoice\u202Efdp.zip" must not display as "...piz.pdf".
const NAME_CONTROLS = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

/** The display name of an uploaded file: no path, no control or bidi characters, at most 255 characters; "" when nothing is left. */
export const cleanFileName = (name) => String(name ?? "").split(/[\\/]/).pop().replace(NAME_CONTROLS, "").trim().slice(0, 255);

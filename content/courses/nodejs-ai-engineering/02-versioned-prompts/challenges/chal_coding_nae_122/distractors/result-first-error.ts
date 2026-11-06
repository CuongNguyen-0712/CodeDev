// @piece result: Return the result
return errors.length > 0 ? { ok: false, ref, errors: errors.slice(0, 1), warnings } : { ok: true, ref, prompt: out, warnings };

// This file sits under src but the directory-level "generated" ignore does not
// apply to it (it is a file, not a generated/ dir). It exists so exclude-glob
// tests have something to target by pattern.
export const noop = () => null;

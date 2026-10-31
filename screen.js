// screen.js: reads MapleStory Classic's always on screen HUD (the EXP line, the level, the quickslot counts and the
// potion in each, the party list) from a shared game window or a screenshot, entirely in the browser.
// The game draws at 1366x768 and stretches to the window, so measure() finds that stretch first; then the client's own
// pictures (data/grind-pictures.json, from npm run boss:grind) are stretched the same way and slid across the frame,
// scored by masked correlation. Shrinking the frame instead loses the one pixel wide digit strokes.
// The EXP line keeps Repot Run Live's reader (exp-tracker/live/index.html), whose digit seeds survive the stretch.
// window.MapleScreen = { load, findExpLine, readExp, measure, readLevel, readCounts, readIcon, readParty }
(function () {
'use strict';

/*EXP-SEEDS-BEGIN*/
// EXP digit and percent templates from Repot Run Live (exp-tracker/fixtures via exp-tracker/tools/make-seeds.js)
const EXP_SEEDS = {"0":[{"g":[0,40,130,140,143,116,23,0,25,108,204,203,203,183,90,17,149,135,43,42,41,56,154,107,224,153,0,0,0,21,174,163,216,153,0,0,0,22,175,154,217,153,0,0,0,22,175,152,215,153,0,0,0,21,174,151,215,153,0,0,0,20,173,150,221,153,0,0,0,18,171,158,155,131,17,13,11,31,157,109,28,100,185,189,188,168,89,19,0,42,146,162,166,128,22,0],"a":0.71},{"g":[0,9,103,146,140,140,53,1,9,72,166,202,203,202,117,37,67,165,70,40,42,40,120,173,108,203,50,0,0,0,132,248,98,203,50,0,0,0,130,247,96,202,49,0,0,0,131,248,94,202,49,0,0,0,130,247,94,202,49,0,0,0,130,247,100,201,48,0,0,0,131,248,67,172,49,10,12,12,110,182,10,73,154,187,188,188,112,42,0,6,114,169,161,159,59,1],"a":0.71}],"1":[{"g":[0,0,0,33,64,154,68,11,5,20,43,147,190,255,145,71,52,109,196,243,255,255,133,52,43,74,119,200,227,255,129,46,0,2,5,108,158,255,131,48,0,0,0,99,150,255,132,49,0,0,0,104,155,255,130,47,0,0,0,103,154,255,130,47,0,0,0,102,153,255,129,45,0,0,0,105,156,255,130,46,0,0,0,118,169,255,138,60,0,0,0,39,75,178,77,9],"a":0.36},{"g":[0,0,0,0,124,124,88,88,25,25,55,55,255,255,219,219,149,149,219,219,255,255,193,193,99,99,162,162,255,255,189,189,0,0,26,26,255,255,198,198,0,0,0,0,255,255,203,203,0,0,0,0,255,255,206,206,0,0,0,0,255,255,205,205,0,0,0,0,255,255,204,204,0,0,0,0,255,255,208,208,0,0,0,0,255,255,226,226,0,0,0,0,145,145,98,98],"a":0.29},{"g":[0,0,21,21,165,165,23,23,40,40,145,145,255,255,102,102,189,189,248,248,255,255,80,80,117,117,207,207,255,255,75,75,4,4,101,101,255,255,79,79,0,0,89,89,255,255,81,81,0,0,95,95,255,255,81,81,0,0,94,94,255,255,80,80,0,0,92,92,255,255,78,78,0,0,94,94,255,255,79,79,0,0,111,111,255,255,96,96,0,0,24,24,193,193,18,18],"a":0.29},{"g":[0,0,0,0,91,91,122,122,16,16,48,48,236,236,255,255,107,107,205,205,255,255,253,253,75,75,140,140,251,251,253,253,0,0,16,16,214,214,255,255,0,0,0,0,214,214,255,255,0,0,0,0,220,220,255,255,0,0,0,0,220,220,255,255,0,0,0,0,219,219,255,255,0,0,0,0,222,222,255,255,0,0,0,0,241,241,255,255,0,0,0,0,106,106,137,137],"a":0.29},{"g":[0,0,0,0,46,46,149,149,7,7,44,44,182,182,255,255,61,61,197,197,255,255,255,255,47,47,122,122,223,223,255,255,0,0,7,7,143,143,255,255,0,0,0,0,136,136,255,255,0,0,0,0,141,141,255,255,0,0,0,0,141,141,255,255,0,0,0,0,140,140,255,255,0,0,0,0,142,142,255,255,0,0,0,0,159,159,255,255,0,0,0,0,55,55,175,175],"a":0.29},{"g":[0,0,0,0,137,137,111,111,0,0,16,16,244,244,189,189,82,82,212,212,255,255,175,175,27,27,121,121,255,255,174,174,0,0,26,26,237,237,181,181,0,0,0,0,236,236,187,187,0,0,0,0,244,244,188,188,0,0,0,0,244,244,188,188,0,0,0,0,244,244,188,188,0,0,0,0,246,246,189,189,0,0,0,0,255,255,196,196,0,0,0,0,255,255,200,200],"a":0.36},{"g":[0,0,0,0,202,202,46,46,0,0,70,70,250,250,95,95,155,155,223,223,255,255,83,83,52,52,151,151,255,255,80,80,0,0,41,41,255,255,83,83,0,0,0,0,255,255,85,85,0,0,0,0,255,255,85,85,0,0,0,0,255,255,84,84,0,0,0,0,255,255,82,82,0,0,0,0,255,255,82,82,0,0,0,0,255,255,89,89,0,0,0,0,255,255,95,95],"a":0.36}],"2":[{"g":[1,43,148,142,142,138,36,1,52,126,203,203,203,202,104,40,194,121,42,43,42,40,130,178,137,52,0,0,0,0,150,248,16,0,0,0,0,0,136,244,0,0,0,0,39,157,124,43,0,0,3,22,96,193,56,1,0,0,27,157,154,26,0,0,1,32,105,114,64,3,0,0,15,137,211,69,0,6,18,16,189,234,246,208,182,185,191,190,156,156,145,151,156,158,170,148],"a":0.64},{"g":[0,7,102,146,140,141,55,1,12,74,167,203,203,203,119,39,74,176,78,42,43,41,117,174,59,114,23,0,0,0,129,247,4,12,0,0,0,0,114,230,0,0,0,0,17,127,132,45,0,0,0,10,59,174,83,0,0,0,0,80,209,39,0,0,0,7,73,100,101,0,0,0,1,51,200,138,0,4,17,13,72,204,246,230,182,184,191,189,40,162,149,147,155,158,168,145],"a":0.71},{"g":[0,56,229,209,216,208,0,0,5,120,233,227,228,212,69,0,210,131,43,42,42,39,198,158,133,36,0,0,0,0,237,201,32,0,0,0,0,0,206,158,0,0,0,0,34,139,104,60,0,0,0,37,91,191,19,0,0,0,0,144,129,73,0,0,0,14,58,185,96,0,0,0,6,80,220,12,5,9,13,0,54,209,255,86,47,66,89,21,255,255,255,255,255,255,255,213],"a":0.73},{"g":[0,0,186,218,209,225,77,0,0,61,201,229,227,231,130,8,161,221,37,42,42,42,81,210,69,117,0,0,0,0,67,255,8,24,0,0,0,0,80,255,0,0,0,0,0,138,127,116,0,0,0,0,59,195,94,0,0,0,0,48,176,79,10,0,0,0,59,115,185,0,0,0,0,20,222,89,2,8,11,13,16,126,255,181,33,62,78,87,174,255,255,255,255,255,255,255],"a":0.73}],"3":[{"g":[0,50,138,140,146,106,12,0,38,116,204,204,202,171,78,11,179,132,45,43,41,66,163,77,126,68,0,0,0,42,195,127,9,4,0,0,0,40,193,107,0,0,7,157,207,157,62,14,0,0,14,179,219,171,62,12,0,0,0,0,0,38,191,95,103,54,0,0,0,38,191,120,185,121,18,13,10,43,170,76,43,111,191,189,187,157,78,12,0,55,156,161,168,118,10,0],"a":0.71},{"g":[0,102,225,209,220,164,0,0,16,145,231,227,229,183,42,0,212,70,42,42,42,34,217,99,151,14,0,0,0,0,255,130,41,0,0,0,0,0,238,103,0,0,2,139,139,126,104,39,0,0,2,192,189,166,48,0,0,0,0,74,71,56,160,51,70,1,0,0,0,0,255,139,242,22,10,10,9,11,236,111,168,105,71,73,70,78,136,10,0,183,255,255,255,255,0,0],"a":0.73},{"g":[0,102,255,255,255,255,102,0,73,117,182,182,182,182,117,73,255,153,0,0,0,0,153,255,109,66,0,0,0,0,153,255,0,0,0,0,0,0,153,255,0,0,0,175,219,219,109,36,0,0,0,175,219,219,109,36,0,0,0,0,0,0,153,255,109,66,0,0,0,0,153,255,255,153,0,0,0,0,153,255,73,117,182,182,182,182,117,73,0,102,255,255,255,255,102,0],"a":0.71},{"g":[0,102,255,255,255,255,102,0,73,117,182,182,182,182,117,73,255,153,0,0,0,0,153,255,109,66,0,0,0,0,153,255,0,0,0,0,0,0,153,255,0,0,0,175,219,219,109,36,0,0,0,175,219,219,109,36,0,0,0,0,0,0,153,255,109,66,0,0,0,0,153,255,255,153,0,0,0,0,153,255,73,117,182,182,182,182,117,73,0,102,255,255,255,255,102,0],"a":0.71}],"4":[{"g":[0,0,0,0,6,108,68,5,0,0,0,15,78,208,165,15,0,0,7,89,210,249,147,13,0,20,94,110,154,232,143,12,3,72,202,87,30,187,147,13,125,117,35,12,9,175,135,11,252,199,36,35,71,203,176,49,224,246,242,233,240,254,255,246,86,128,122,118,139,224,209,133,0,0,0,0,24,184,142,12,0,0,0,0,36,191,159,15,0,0,0,0,6,126,73,5],"a":0.64},{"g":[0,0,0,0,25,110,34,0,0,0,0,18,95,238,85,0,0,0,0,111,227,228,75,0,0,25,86,113,174,226,73,0,0,72,202,53,69,229,76,0,97,123,46,7,51,224,71,0,194,179,47,35,87,234,103,20,170,246,242,233,244,255,250,130,66,129,124,117,151,242,167,63,0,0,0,0,51,226,73,0,0,0,0,0,51,238,85,0,0,0,0,0,29,125,37,0],"a":0.71},{"g":[0,0,0,0,31,111,27,0,0,0,0,22,114,225,72,0,0,0,5,128,233,216,63,0,0,29,91,117,184,214,61,0,1,82,194,45,74,217,64,0,109,110,39,6,51,212,59,0,220,169,37,35,107,225,94,17,193,246,242,232,249,255,250,113,75,128,124,116,160,238,162,54,0,0,0,0,56,214,61,0,0,0,0,0,68,225,72,0,0,0,0,0,36,126,28,0],"a":0.71},{"g":[0,0,0,0,0,157,93,0,0,0,0,0,29,246,164,0,0,0,0,82,214,255,149,0,0,0,102,105,109,255,148,0,0,16,211,76,20,254,154,0,69,133,114,26,0,247,143,0,140,238,46,34,42,248,177,41,144,255,158,140,151,255,239,150,90,185,185,185,185,253,229,185,0,0,0,0,0,248,158,0,0,0,0,0,0,255,151,0,0,0,0,0,0,255,171,0],"a":0.73}],"5":[{"g":[131,137,133,137,137,137,147,132,254,235,197,202,203,203,206,203,247,147,29,39,43,42,48,41,242,107,0,0,0,0,0,0,242,106,0,0,0,0,0,0,44,125,197,198,202,193,42,0,3,72,219,219,219,213,114,37,4,0,0,0,0,0,125,222,110,43,0,0,0,0,146,248,208,103,13,13,11,13,124,189,59,116,189,188,188,189,97,45,1,47,171,164,164,160,40,1],"a":0.64},{"g":[113,138,134,137,137,141,150,44,255,235,201,203,203,204,208,101,251,158,37,41,42,45,51,11,248,131,0,0,0,0,0,0,223,121,0,0,0,0,0,0,43,120,187,198,206,148,18,0,0,75,206,219,219,177,67,12,0,0,0,0,0,40,193,92,104,52,0,0,0,41,194,114,187,117,18,13,11,45,170,69,44,112,191,189,188,156,77,11,0,56,157,161,168,117,9,0],"a":0.71}],"6":[{"g":[1,56,141,140,147,100,7,0,39,120,203,203,203,166,73,11,174,117,41,43,42,79,176,73,244,121,0,0,0,24,111,57,243,118,0,0,0,0,11,4,253,218,179,194,206,140,12,0,254,230,210,218,219,173,63,7,245,122,0,0,0,48,201,60,244,119,0,0,0,51,204,86,184,107,12,13,10,50,172,59,44,114,188,189,187,151,70,10,1,61,161,161,168,112,6,0],"a":0.71},{"g":[0,0,200,216,209,227,60,0,0,66,213,229,227,233,124,6,151,206,39,42,42,43,123,210,182,234,0,0,0,0,33,131,172,237,0,0,0,0,0,31,166,248,139,139,139,139,57,0,169,255,177,182,188,185,105,44,176,243,53,60,68,65,100,154,187,231,0,0,0,0,87,255,175,228,10,10,10,8,88,234,46,120,71,71,73,65,100,125,0,0,255,255,255,255,118,0],"a":0.73},{"g":[0,0,179,218,209,227,84,0,0,53,194,229,227,232,137,13,131,219,35,42,42,42,95,211,157,255,0,0,0,0,23,141,146,255,0,0,0,0,0,36,138,255,139,139,139,139,75,0,136,255,183,181,188,186,123,50,140,255,62,58,68,66,84,163,150,255,0,0,0,0,47,255,143,235,10,9,10,9,54,236,34,131,74,70,73,68,97,139,0,0,255,255,255,255,153,0],"a":0.73}],"7":[{"g":[232,216,209,209,206,197,213,65,250,234,227,227,215,218,251,134,46,43,42,42,39,40,255,132,0,0,0,0,0,0,255,133,0,0,0,0,0,0,255,134,0,0,0,0,0,0,255,144,0,0,0,0,3,54,192,87,0,0,0,0,58,169,74,4,0,0,0,69,131,185,0,0,0,0,0,254,91,0,0,0,0,0,0,255,89,0,0,0,0,0,0,255,95,0,0,0],"a":0.73}],"8":[{"g":[1,33,137,143,142,152,47,2,37,95,203,203,203,202,128,50,174,138,42,42,42,40,105,187,250,165,0,0,0,0,103,241,236,144,0,0,0,0,97,240,38,94,174,197,197,194,116,43,33,89,198,219,219,219,115,42,214,135,0,0,0,0,92,239,250,163,0,0,0,0,98,241,185,134,14,11,12,8,91,200,42,91,189,188,188,186,118,56,1,36,155,165,163,174,50,2],"a":0.64},{"g":[1,42,147,142,142,140,37,1,46,120,202,203,203,202,107,41,183,115,39,41,41,40,128,178,244,122,0,0,0,0,145,247,243,111,0,0,0,0,128,245,42,110,187,197,197,180,100,41,39,110,217,219,219,206,99,36,233,104,0,0,0,0,123,222,244,119,0,0,0,0,143,247,196,106,10,12,12,13,120,191,52,111,187,188,188,189,99,47,1,46,169,164,164,161,41,1],"a":0.64},{"g":[0,50,138,140,146,106,12,0,34,112,203,203,202,171,78,11,170,126,41,43,41,66,163,77,252,143,0,0,0,42,195,127,222,125,0,0,0,40,193,107,38,102,179,197,196,157,62,14,31,99,201,219,219,171,62,12,203,118,0,0,0,38,191,95,251,142,0,0,0,38,191,120,179,118,13,12,10,43,170,76,37,106,189,188,187,157,78,12,0,55,156,161,168,118,10,0],"a":0.71},{"g":[0,118,223,209,220,146,0,0,19,156,230,227,229,175,35,0,212,33,42,42,42,32,216,91,255,1,0,0,0,0,255,115,255,20,0,0,0,1,252,85,116,111,139,139,139,116,114,30,50,138,185,188,185,157,49,0,162,58,64,68,65,58,161,41,255,0,0,0,0,0,255,112,238,14,9,10,9,12,237,90,147,89,66,73,68,82,142,6,0,209,255,255,255,255,0,0],"a":0.73}],"9":[{"g":[1,41,146,142,142,143,39,1,45,117,202,203,203,202,109,42,182,120,40,41,41,40,124,180,245,129,0,0,0,0,132,245,243,117,0,0,0,0,133,246,44,120,193,198,190,176,228,254,3,66,219,219,218,207,235,254,3,0,0,0,0,0,136,246,110,48,0,0,0,0,128,245,205,113,15,13,12,12,115,192,56,111,190,189,188,188,102,48,1,45,167,164,164,163,42,1],"a":0.64},{"g":[0,35,126,140,142,121,29,0,22,101,196,203,203,191,97,21,136,138,44,42,42,48,144,125,211,153,0,0,0,3,156,187,181,158,5,0,0,10,163,172,31,96,175,198,190,188,237,166,0,52,183,219,216,214,243,165,0,1,0,0,0,15,168,170,81,67,0,0,0,1,154,181,142,149,24,13,11,21,144,129,31,100,180,188,188,173,93,24,0,35,140,163,164,135,30,0],"a":0.71},{"g":[1,33,137,143,142,152,47,2,37,95,203,203,203,202,128,50,174,138,42,42,42,40,105,187,250,165,0,0,0,0,96,240,236,144,0,0,0,0,100,241,40,109,182,198,192,173,222,253,0,45,208,219,219,206,230,253,0,0,0,0,0,0,105,242,107,61,0,0,0,0,91,240,195,134,19,13,12,8,91,200,47,96,192,189,188,186,118,56,1,36,155,165,163,174,50,2],"a":0.64}],"%":[{"g":[0,94,34,0,0,0,49,88,32,181,87,12,0,15,124,137,160,69,145,65,0,87,137,23,114,95,125,42,46,127,67,0,9,169,72,0,129,112,4,0,0,26,9,95,107,18,0,0,0,0,27,152,61,13,17,0,0,5,143,76,0,101,120,0,0,86,114,31,54,115,114,64,16,154,51,0,100,98,88,118,170,72,10,0,23,116,126,27,122,24,0,0,0,63,72,0],"a":1},{"g":[3,104,29,0,0,0,24,121,52,164,99,10,0,9,80,205,172,70,150,64,0,56,159,48,128,107,119,45,27,129,100,1,22,173,68,1,94,153,13,0,1,33,9,87,141,22,1,0,0,1,22,144,85,9,24,0,0,8,161,83,0,65,167,8,2,88,135,27,43,107,111,110,31,165,47,0,72,142,52,176,184,77,8,0,15,101,153,47,132,21,0,0,0,37,109,1],"a":0.93},{"g":[5,139,43,0,0,0,33,169,25,166,96,0,0,1,64,189,193,91,163,125,0,38,172,62,106,116,121,46,24,111,89,9,28,147,66,2,77,151,18,0,5,71,21,51,124,77,0,0,0,0,18,107,99,14,29,0,0,0,88,123,29,30,110,11,2,41,149,88,23,78,152,79,15,149,77,0,75,156,52,192,70,138,28,0,34,110,81,118,236,84,0,0,0,46,185,27],"a":1}]};
/*EXP-SEEDS-END*/

/* ---------- image helpers ---------- */

const sizeOf = src => ({ w: src.displayWidth || src.videoWidth || src.naturalWidth || src.width, h: src.displayHeight || src.videoHeight || src.naturalHeight || src.height });
function ctx2d(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c.getContext('2d', { willReadFrequently: true }); }
const lumAt = (d, k) => 0.3 * d[k] + 0.59 * d[k + 1] + 0.11 * d[k + 2];
// a box of the frame as RGBA plus luminance; parts outside the frame come back black
function region(src, x, y, w, h) {
  x = Math.round(x); y = Math.round(y); w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  const g = ctx2d(w, h); g.drawImage(src, x, y, w, h, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h).data, L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = lumAt(data, i * 4);
  return { x, y, w, h, data, L };
}

/* ---------- the EXP line (Repot Run Live's reader) ---------- */

const GW = 8, GH = 12;
function components(mask, w, h, minArea) {
  const seen = new Uint8Array(w * h), out = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || seen[s]) continue;
    const st = [s]; let x0 = w, x1 = 0, y0 = h, y1 = 0, n = 0;
    seen[s] = 1;
    while (st.length) {
      const q = st.pop(), qx = q % w, qy = (q / w) | 0; n++;
      if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = qx + dx, ny = qy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (mask[ni] && !seen[ni]) { seen[ni] = 1; st.push(ni); }
      }
    }
    if (n >= (minArea || 1)) out.push({ x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, n });
  }
  return out;
}
// a rectangle of a feature map resampled to a fixed grid by area averaging
function gridOf(map, mw, mh, x0, y0, w, h, gw, gh) {
  const out = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const sx0 = x0 + gx * w / gw, sx1 = x0 + (gx + 1) * w / gw, sy0 = y0 + gy * h / gh, sy1 = y0 + (gy + 1) * h / gh;
    let sum = 0, wt = 0;
    for (let y = Math.floor(sy0); y < Math.ceil(sy1); y++) for (let x = Math.floor(sx0); x < Math.ceil(sx1); x++) {
      const ox = Math.min(sx1, x + 1) - Math.max(sx0, x), oy = Math.min(sy1, y + 1) - Math.max(sy0, y);
      if (ox <= 0 || oy <= 0) continue;
      sum += (x < 0 || y < 0 || x >= mw || y >= mh ? 0 : map[y * mw + x]) * ox * oy; wt += ox * oy;
    }
    out[gy * gw + gx] = wt ? sum / wt : 0;
  }
  return out;
}
function classifyExp(grid, aspect) {
  const gq = Array.prototype.map.call(grid, v => Math.round(v * 255));
  const per = {};
  for (const lab in EXP_SEEDS) {
    for (const t of EXP_SEEDS[lab]) {
      let s = 0; for (let i = 0; i < gq.length; i++) { const d = (t.g[i] - gq[i]) / 255; s += d * d; }
      const d = s / gq.length + 0.5 * Math.pow(t.a - aspect, 2);
      if (per[lab] == null || d < per[lab]) per[lab] = d;
    }
  }
  const r = Object.entries(per).sort((a, b) => a[1] - b[1]);
  return r.length ? { label: r[0][0], dist: r[0][1], second: r[1] ? r[1][1] : 9 } : { label: null, dist: 9, second: 9 };
}
// a glyph is sure when it's close to its template, or a little further but at least twice as close as any other
// (a 7 drawn at a new stretch sat at 0.053, with the next best, a 2, at 0.136)
const EXP_SURE = 0.05, EXP_NEAR = 0.08, EXP_RATIO = 2;
const sureGlyph = g => g.label != null && (g.dist <= EXP_SURE || (g.dist <= EXP_NEAR && g.second >= EXP_RATIO * g.dist));
// how white a pixel is, 0..1
function whiteMap(img) {
  const m = new Float32Array(img.w * img.h);
  for (let i = 0; i < m.length; i++) { const k = i * 4, mn = Math.min(img.data[k], img.data[k + 1], img.data[k + 2]); m[i] = Math.max(0, Math.min(1, (mn - 110) / 145)); }
  return m;
}
const isGreen = (r, g, b) => g > 170 && b < 120 && g > r + 15 && r > 90;
const greenBrackets = (img, w, h) => {
  const gm = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) { const k = i * 4; gm[i] = isGreen(img.data[k], img.data[k + 1], img.data[k + 2]) ? 1 : 0; }
  return components(gm, w, h, 6).filter(c => c.h >= 7 && c.w <= 6 && c.h >= 2 * c.w).sort((a, b) => a.x0 - b.x0);
};
// the EXP line's box: the lowest pair of green brackets in the bottom part of the frame
function findExpLine(src, fw, fh) {
  const y0 = Math.floor(fh * 0.55), img = region(src, 0, y0, fw, fh - y0), cs = greenBrackets(img, img.w, img.h);
  let o = null, c = null;
  for (let j = 0; j + 1 < cs.length; j++) {
    if (Math.abs(cs[j].y0 - cs[j + 1].y0) <= 1 && cs[j].h === cs[j + 1].h && cs[j + 1].x0 - cs[j].x0 < 200 && (!o || cs[j].y0 >= o.y0)) { o = cs[j]; c = cs[j + 1]; }
  }
  if (!o) return null;
  const x = Math.max(0, o.x0 - 150), y = o.y0 + y0 - 6;
  return { x, y, w: Math.min(fw - x, (c.x1 - o.x0) + 160), h: o.h + 12, digitH: o.h };
}
// "EXP 98,856[17.79%]": { ok, exp, pct } or { ok: false, reason }
function readExp(src, line) {
  const r = expGlyphs(src, line);
  if (!r.ok) return r;
  const all = r.glyphs;
  if (!all.every(sureGlyph)) return { ok: false, reason: 'unknown glyph' };
  const ex = all.filter(g => g.side === 'exp' && /^\d$/.test(g.label)).map(g => g.label).join('');
  const pc = all.filter(g => g.side === 'pct' && /^\d$/.test(g.label)).map(g => g.label).join('');
  if (!ex || !pc) return { ok: false, reason: 'incomplete' };
  return { ok: true, exp: parseInt(ex, 10), pct: parseInt(pc, 10) / 100 };
}
// the EXP line cut into its tall glyphs, left to right, each with its best guess: { ok, glyphs: [{ label, dist, second,
// side ('exp' | 'pct'), grid, aspect }] } (tools/make-exp-seeds.js learns from these)
function expGlyphs(src, line) {
  const img = region(src, line.x, line.y, line.w, line.h), w = img.w, h = img.h, wm = whiteMap(img);
  const gc = greenBrackets(img, w, h);
  if (gc.length < 2) return { ok: false, reason: 'EXP brackets not found' };
  const open = gc[gc.length - 2], close = gc[gc.length - 1];
  const yTop = Math.min(open.y0, close.y0), yBot = Math.max(open.y1, close.y1);
  const bm = new Uint8Array(w * h);
  for (let j = Math.max(0, yTop - 4); j <= Math.min(h - 1, yBot + 4); j++) for (let x = 0; x < w; x++) bm[j * w + x] = wm[j * w + x] > 0.3 ? 1 : 0;
  const comps = components(bm, w, h, 2).sort((a, b) => a.x0 - b.x0);
  const inside = comps.filter(c => c.x0 > open.x1 && c.x1 < close.x0);
  if (!inside.length) return { ok: false, reason: 'no digits between brackets' };
  const tallest = Math.max(...inside.map(q => q.h));
  const tall = inside.filter(c => c.h >= 0.6 * tallest).map(c => c.h).sort((a, b) => a - b);
  const refH = tall[(tall.length / 2) | 0];
  const glyphOf = (c, side) => { const grid = gridOf(wm, w, h, c.x0, c.y0, c.w, c.h, GW, GH), cl = classifyExp(grid, c.w / c.h); return { label: cl.label, dist: cl.dist, second: cl.second, side, box: c, grid, aspect: c.w / c.h }; };
  const glyphs = inside.filter(c => c.h >= 0.7 * refH).map(c => glyphOf(c, 'pct'));
  // walk left from the opening bracket while glyphs stay close together
  const left = comps.filter(c => c.x1 < open.x0).reverse(), gapMax = 0.85 * refH, leftG = [];
  let edge = open.x0;
  for (const c of left) {
    if (c.h < 0.7 * refH) { edge = Math.min(edge, c.x0); continue; }        // comma, dot or the bar line
    if (c.h > 1.2 * refH || (c.w >= 0.7 * c.h && c.n / (c.w * c.h) > 0.6)) break;  // the bold EXP label
    if (edge - c.x1 > gapMax && leftG.length) break;
    leftG.push(glyphOf(c, 'exp')); edge = c.x0;
  }
  const all = leftG.reverse().concat(glyphs).sort((a, b) => a.box.x0 - b.box.x0);
  for (const g of all) g.sure = sureGlyph(g);
  return { ok: true, glyphs: all };
}

/* ---------- the client's pictures, stretched ---------- */

const raw = { count: {}, level: {}, icon: {}, party: null };
const DIGITS = '0123456789'.split('');
// count digits also come shifted half a pixel across: after the stretch a slot sits at a fractional pixel, and a thin 1
// scores 0.8 at the wrong phase against 0.95 at the right one. A key's first character is its digit.
const COUNT_KEYS = DIGITS.concat(DIGITS.map(d => d + '~'));
// inventory slots also come half a pixel down (a row of slots can sit at a fractional pixel too)
const SLOT_KEYS = COUNT_KEYS.concat(DIGITS.map(d => d + '^'), DIGITS.map(d => d + '~^'));
function load(pics) {
  const img = u => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = u; });
  const jobs = [];
  for (const [set, key] of [['ItemNo', 'count'], ['LevelNo', 'level'], ['Icons', 'icon']]) {
    for (const [k, u] of Object.entries(pics[set] || {})) jobs.push(img(u).then(i => { if (i) raw[key][k] = i; }));
  }
  if (pics.InvBg) jobs.push(img(pics.InvBg).then(i => { raw.inv = i; }));
  raw.etcIcon = {};
  for (const [k, u] of Object.entries(pics.EtcIcons || {})) jobs.push(img(u).then(i => { if (i) raw.etcIcon[k] = i; }));
  raw.mesoDigits = pics.MesoDigits || {};
  return Promise.all(jobs).then(() => { cache.clear(); icons = null; inv = null; etcIcons = null; slotSc = { s: 0, sc: 0 }; });
}
// a picture stretched by s with smoothing (as the game does): luminance on its solid pixels, their mean and variance
function stretched(im, s, ox = 0, oy = 0) {
  const w = Math.round(im.width * s), h = Math.round(im.height * s), g = ctx2d(w, h);
  g.imageSmoothingEnabled = true; g.drawImage(im, ox, oy, w, h);
  const d = g.getImageData(0, 0, w, h).data, L = new Float32Array(w * h), idx = [];
  let sm = 0, ss = 0;
  for (let i = 0; i < w * h; i++) { L[i] = lumAt(d, i * 4); if (d[i * 4 + 3] > 230) { idx.push(i); sm += L[i]; ss += L[i] * L[i]; } }
  const mean = sm / idx.length;
  return { w, h, L, idx, mean, v: ss / idx.length - mean * mean };
}
const cache = new Map();
function setAt(kind, s) {
  const key = kind + s.toFixed(4);
  if (!cache.has(key)) {
    if (cache.size > 40) cache.clear();
    const set = {}; for (const [k, im] of Object.entries(raw[kind])) { set[k] = stretched(im, s); if (kind === 'count') { set[k + '~'] = stretched(im, s, 0.5); set[k + '^'] = stretched(im, s, 0, 0.5); set[k + '~^'] = stretched(im, s, 0.5, 0.5); } }
    cache.set(key, set);
  }
  return cache.get(key);
}
function ncc(img, x, y, t) {
  if (x < 0 || y < 0 || x + t.w > img.w || y + t.h > img.h) return -1;
  const L = img.L, W = img.w, n = t.idx.length, base = y * W + x;
  let sa = 0, saa = 0, sab = 0;
  for (let j = 0; j < n; j++) {
    const i = t.idx[j], a = L[base + ((i / t.w) | 0) * W + (i % t.w)];
    sa += a; saa += a * a; sab += a * t.L[i];
  }
  const ma = sa / n, va = saa / n - ma * ma;
  return va < 40 ? 0 : (sab / n - ma * t.mean) / Math.sqrt(va * t.v);
}
function best(img, set, keys, x0, x1, y0, y1, step = 1) {
  let b = { d: null, score: -1, x: 0, y: 0, t: null };
  for (const k of keys) {
    const t = set[k];
    for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) {
      const sc = ncc(img, x, y, t); if (sc > b.score) b = { d: k, score: sc, x, y, t };
    }
  }
  return b;
}

/* ---------- stretch, level ---------- */

// patches relative to the EXP line, in base (1366x768) pixels
const levelArea = (line, s) => ({ x: line.x - 470 * s, y: line.y - 20 * s, w: 210 * s, h: 60 * s + line.h });
const slotArea = (line, s) => ({ x: line.x + 190 * s, y: line.y - 128 * s, w: 220 * s, h: 106 * s });
// ROUGH only picks spots worth checking (a 6 over the White Potion's bright bottle scores under 0.55 against an 8);
// every spot must still match a real digit at DIGIT to count
const LEVEL = 0.8, DIGIT = 0.85, NEXT = 0.8, ROUGH = 0.45;

// { s, sc, score, countScore }: s for the level boxes, sc for the count digits (a pixel of rounding apart at these sizes).
// First guess the window height / 768, then the EXP digit height; find a level box there and fine tune on that spot.
function measure(src, line, frameH) {
  let top = { s: 0, score: -1 };
  for (const g0 of [frameH / 768, line.digitH / 6.4]) {
    const a = levelArea(line, g0), img = region(src, a.x, a.y, a.w, a.h), set = setAt('level', g0), t0 = set['0'];
    if (!t0) break;
    const spot = best(img, set, DIGITS, 0, img.w - t0.w, 0, img.h - t0.h, 2);
    if (spot.score < 0.6) continue;
    const cx = img.x + spot.x, cy = img.y + spot.y;
    for (let s = g0 * 0.92; s <= g0 * 1.08; s += 0.0125) {
      const fine = setAt('level', s), f0 = fine['0'], near = region(src, cx - 8, cy - 8, f0.w + 16, f0.h + 16);
      const b = best(near, fine, DIGITS, 0, near.w - f0.w, 0, near.h - f0.h);
      if (b.score > top.score) top = { s: Math.round(s * 1000) / 1000, score: b.score };
    }
    if (top.score >= 0.85) break;
  }
  const out = { s: top.s, sc: top.s, score: Math.max(0, top.score), countScore: 0 };
  if (out.score >= LEVEL) { const c = fineCounts(src, line, out.s); out.sc = c.sc; out.countScore = c.score; }
  return out;
}
function readLevel(src, line, m) {
  const a = levelArea(line, m.s), img = region(src, a.x, a.y, a.w, a.h), set = setAt('level', m.s), t0 = set['0'];
  const first = best(img, set, DIGITS, 0, img.w - t0.w, 0, img.h - t0.h);
  if (first.score < LEVEL) return { ok: false, score: first.score };
  const ds = [first];
  const r = best(img, set, DIGITS, first.x + t0.w - 3, first.x + t0.w + 3, first.y - 1, first.y + 1);
  const l = best(img, set, DIGITS, first.x - t0.w - 3, first.x - t0.w + 2, first.y - 1, first.y + 1);
  if (r.score >= LEVEL) ds.push(r);
  if (l.score >= LEVEL) ds.unshift(l);
  return { ok: true, level: parseInt(ds.map(q => q.d).join(''), 10), score: Math.min(...ds.map(q => q.score)) };
}

/* ---------- quickslot counts ---------- */

function roughSpots(img, set, min) {
  const spots = [];
  for (const t of [set['8'], set['1']]) {
    for (let y = 0; y + t.h <= img.h; y++) for (let x = 0; x + t.w <= img.w; x++) {
      const sc = ncc(img, x, y, t); if (sc <= min) continue;
      const near = spots.find(p => Math.abs(p.x - x) < 4 && Math.abs(p.y - y) < 4);
      if (!near) spots.push({ x, y, score: sc }); else if (sc > near.score) Object.assign(near, { x, y, score: sc });
    }
  }
  return spots;
}
// the count digits' own stretch, scored by the mean of the 6 best spots (key labels like "Shift" only add noise)
function fineCounts(src, line, s) {
  const a = slotArea(line, s), img = region(src, a.x, a.y, a.w, a.h);
  const spots = roughSpots(img, setAt('count', s), 0.6).sort((p, q) => q.score - p.score).slice(0, 24);
  let top = { sc: s, score: 0 };
  if (!spots.length) return top;
  for (let sc = s * 0.97; sc <= s * 1.08; sc += 0.0125) {
    const set = setAt('count', sc);
    const scores = spots.map(p => best(img, set, COUNT_KEYS, p.x - 3, p.x + 3, p.y - 3, p.y + 3).score).sort((p, q) => q - p).slice(0, 6);
    const mean = scores.reduce((p, q) => p + q, 0) / scores.length;
    if (mean > top.score) top = { sc: Math.round(sc * 1000) / 1000, score: mean };
  }
  return top;
}
const KEYS = [['Shift', 'Ins', 'Hm', 'Pup'], ['Ctrl', 'Del', 'End', 'Pdn']];
const keyOf = (bx, by) => { const row = KEYS[by < -73 ? 0 : 1], col = Math.round((bx - 241) / 36); return row[col] || null; };
// every count in the two potion rows: [{ key, bx, by, x, y, value, score }] (bx, by in base pixels from the EXP line).
// Nothing when measure() couldn't match the count digits well (a shrunk or blurry share): half read numbers like
// "93" for 293 would be worse than none.
const COUNTS_OK = 0.8;
// quickslot to quickslot in base pixels (65.8 and 63.9 screen pixels on Rimmah's 2560x1440, stretch 1.875)
const PITCH_X = 35.1, PITCH_Y = 34.1;
const cellOf = key => { const r = KEYS.findIndex(row => row.includes(key)); return r < 0 ? null : { r, c: KEYS[r].indexOf(key) }; };
function readCounts(src, line, m) {
  if (m.countScore != null && m.countScore < COUNTS_OK) return [];
  const a = slotArea(line, m.s), img = region(src, a.x, a.y, a.w, a.h), set = setAt('count', m.sc), t0 = set['0'];
  // grow a first digit into its number: each digit starts where the one before it ends (a 1 is narrower). A number counts
  // when every digit matches at NEXT and at least one at DIGIT ("61" over a White Potion: the 1 at 0.84, the 6 at 0.92).
  const grow = sd => {
    const n = [sd];
    for (let k = 0; k < 5; k++) {
      const l = n[n.length - 1], r = best(img, set, COUNT_KEYS, l.x + l.t.w - 2, l.x + l.t.w + 2, l.y - 1, l.y + 1);
      if (r.score < NEXT) break; n.push(r);
    }
    for (let k = 0; k < 5; k++) {
      const f = n[0]; let lb = { score: -1 };
      for (const d of COUNT_KEYS) { const t = set[d], c = best(img, set, [d], f.x - t.w - 2, f.x - t.w + 2, f.y - 1, f.y + 1); if (c.score > lb.score) lb = c; }
      if (lb.score < NEXT) break; n.unshift(lb);
    }
    return n.some(q => q.score >= DIGIT) ? n : null;
  };
  const out = n => {
    const x = img.x + n[0].x, y = img.y + n[0].y, bx = (x - line.x) / m.s, by = (y - line.y) / m.s;
    return { key: keyOf(bx, by), bx, by, x, y, value: parseInt(n.map(q => q.d[0]).join(''), 10), score: Math.min(...n.map(q => q.score)) };
  };
  // first pass: spots that look like an 8 or a 1, each checked 4 pixels either way for the real digit (the 8 picture best
  // fits the 4 of "477" 4 pixels to its right)
  const seeds = [];
  for (const h of roughSpots(img, set, ROUGH)) {
    const b = best(img, set, COUNT_KEYS, h.x - 4, h.x + 4, h.y - 2, h.y + 2);
    if (b.score >= NEXT && !seeds.some(f => Math.abs(f.x - b.x) < 4 && Math.abs(f.y - b.y) < 4)) seeds.push(b);
  }
  const nums = [];
  for (const sd of seeds.sort((p, q) => q.score - p.score)) {
    if (nums.some(n => n.some(f => Math.abs(f.y - sd.y) <= 3 && Math.abs(f.x - sd.x) < 4))) continue;
    const n = grow(sd); if (n) nums.push(n);
  }
  const found = nums.map(out).filter(n => n.key);
  // second pass: every count starts at the same spot in its slot, so the counts found place the rest on the grid. A number
  // with nothing like an 8 or a 1 in it ("75" of Meat) gives the first pass nowhere to start. The grid is measured from
  // the counts themselves (the stretch measured off the level boxes wobbles a few percent between frames).
  if (found.length) {
    const cells = found.map(f => Object.assign({ f }, cellOf(f.key)));
    const pitch = (axis, k, def) => {
      for (const p of cells) for (const q of cells) {
        const d = q[k] - p[k];
        if (d && (axis === 'x' ? p.r === q.r : p.c === q.c)) return (q.f[axis] - p.f[axis]) / d;
      }
      return def * m.sc;
    };
    const px = pitch('x', 'c', PITCH_X), py = pitch('y', 'r', PITCH_Y), at = cells[0];
    for (let r = 0; r < KEYS.length; r++) for (let c = 0; c < KEYS[r].length; c++) {
      const key = KEYS[r][c];
      if (found.some(f => f.key === key)) continue;
      const ex = Math.round(at.f.x + (c - at.c) * px - img.x), ey = Math.round(at.f.y + (r - at.r) * py - img.y);
      const x0 = Math.max(0, ex - 6), x1 = Math.min(img.w - t0.w, ex + 6), y0 = Math.max(0, ey - 3), y1 = Math.min(img.h - t0.h, ey + 3);
      if (x0 > x1 || y0 > y1) continue;
      const b = best(img, set, COUNT_KEYS, x0, x1, y0, y1);
      if (b.score < NEXT) continue;
      const n = grow(b); if (!n) continue;
      found.push(Object.assign(out(n), { key }));
    }
  }
  return found;
}

/* ---------- potion icons: at base size by colour, ignoring the bottom rows where the count is drawn ---------- */

let icons = null;
function iconSet() {
  if (icons) return icons;
  icons = {};
  for (const [id, im] of Object.entries(raw.icon)) icons[id] = iconFrom(im);
  return icons;
}
// an icon's solid pixels above the bottom 12 rows (where a count is drawn over it)
function iconFrom(im) {
  const g = ctx2d(im.width, im.height); g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, im.width, im.height).data, idx = [];
  for (let i = 0; i < im.width * (im.height - 12); i++) if (d[i * 4 + 3] > 200) idx.push(i);
  return { w: im.width, h: im.height, d, idx };
}
// { id, diff, share }: the potion icon in the cell above a count (a diff under 75 is a match). The slot's key label
// ("End") is printed over the icon's top and the count over its bottom, so an icon is scored by the share of its pixels
// within ICON_TOL of the screen (whatever covers it just doesn't count) rather than an average difference, which the
// label dragged to ~55 for every potion and left Meat and Stew a coin toss. It names one only when it is clearly best.
const ICON_TOL = 20, ICON_SHARE = 0.33, ICON_GAP = 0.03;
function readIcon(src, count, m) {
  const I = iconSet(), W = 52, H = 48, x0 = count.x - 10 * m.s, y0 = count.y - 34 * m.s;
  const g = ctx2d(W, H); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(src, x0, y0, W * m.s, H * m.s, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data, tol = ICON_TOL * 3;
  let top = { id: null, share: 0 }, second = 0;
  for (const [id, t] of Object.entries(I)) {
    const n = t.idx.length;
    let bestK = 0;
    for (let y = 0; y + t.h <= H; y++) for (let x = 0; x + t.w <= W; x++) {
      const base = y * W + x;
      let k = 0;
      for (let j = 0; j < n; j++) {
        if (k + (n - j) <= bestK) break;   // can't beat this icon's best spot
        const i = t.idx[j], a = (base + ((i / t.w) | 0) * W + (i % t.w)) * 4, q = i * 4;
        if (Math.abs(d[a] - t.d[q]) + Math.abs(d[a + 1] - t.d[q + 1]) + Math.abs(d[a + 2] - t.d[q + 2]) < tol) k++;
      }
      if (k > bestK) bestK = k;
    }
    const share = bestK / n;
    if (share > top.share) { second = top.share; top = { id, share }; } else if (share > second) second = share;
  }
  const sure = top.share >= ICON_SHARE && top.share - second >= ICON_GAP;
  return { id: sure ? top.id : null, share: top.share, diff: sure ? Math.round((1 - top.share) * 100) : 100 };
}

/* ---------- party: the HP gauges in the party list, right of the quickslots ---------- */

// The client's party bar picture is only a dark backing under a gauge that changes with each member's HP, so count the
// red gauges instead: { n, sure }. No gauges is solo (or the list is hidden); one gauge is a party left with just you in
// it (someone left a party of two). A list briefly covered by a tooltip is the caller's to smooth over.
// Gauges are found as bands of mostly red rows (the pale highlight row inside a gauge is bridged), so a thin red
// thing in the scene can't join two gauges the way it would join two blobs.
// The party window can be moved, so search the whole region above the right end of the status bar. Each member's
// gauge is a band of red rows starting at the same x, one row (~17 base px) under the next; monster HP bars don't
// stack like that. The longest such stack is the party (no stack, or one gauge, is 1).
const partyArea = (line, s) => ({ x: line.x + 200 * s, y: line.y - 300 * s, w: 540 * s, h: 296 * s });
function readParty(src, line, m) {
  const s = m.s, a = partyArea(line, s), img = region(src, a.x, a.y, a.w, a.h), d = img.data, W = img.w;
  const red = (x, y) => { const k = (y * W + x) * 4; return d[k] > 150 && d[k + 1] < 90 && d[k + 2] < 90 && d[k] - d[k + 1] > 100; };
  // red runs per row, joined into bands across neighbouring rows that start at about the same x
  const bands = [], gap = Math.max(2, Math.round(1.5 * s)), minRun = 10 * s;
  for (let y = 0; y < img.h; y++) {
    let st = -1;
    for (let x = 0; x <= W; x++) {
      const on = x < W && red(x, y);
      if (on && st < 0) st = x;
      if (on || st < 0) continue;
      if (x - st >= minRun) {
        const b = bands.find(q => y - q.y1 <= gap && y > q.y1 - 1 && Math.abs(q.x0 - st) <= 4);
        if (b) { b.y1 = y; b.x0 = Math.min(b.x0, st); } else bands.push({ x0: st, y0: y, y1: y });
      }
      st = -1;
    }
  }
  // a gauge's frame: just left of the red, a thin white border and then the black outline (potion icons have neither)
  const lum = (x, y) => { const k = (y * W + x) * 4; return 0.3 * d[k] + 0.59 * d[k + 1] + 0.11 * d[k + 2]; };
  const framed = b => {
    const y = Math.round((b.y0 + b.y1) / 2), w = Math.max(2, Math.round(1.5 * s));
    if (b.x0 - 3 * w < 0) return false;
    let white = 0, dark = 255;
    for (let x = b.x0 - w; x < b.x0; x++) white = Math.max(white, lum(x, y));
    for (let x = b.x0 - 3 * w; x < b.x0 - w; x++) dark = Math.min(dark, lum(x, y));
    if (!(white > 170 && dark < 80)) return false;
    // and the gauge's long black outline just above it, ~55 base px across (an icon has no such line)
    const span = Math.round(50 * s);
    if (b.x0 + span >= W) return false;
    for (let k = 1; k <= Math.ceil(4 * s) && b.y0 - k >= 0; k++) {
      let n = 0; for (let x = b.x0; x < b.x0 + span; x++) if (lum(x, b.y0 - k) < 80) n++;
      if (n >= 0.7 * span) return true;
    }
    return false;
  };
  const gauges = bands.filter(b => b.y1 - b.y0 + 1 >= 2 * s && b.y1 - b.y0 + 1 <= 9 * s && framed(b)).sort((p, q) => p.y0 - q.y0);
  // the longest stack of gauges with the same left edge, one party row apart
  let most = gauges.length ? 1 : 0;
  for (let i = 0; i < gauges.length; i++) {
    let n = 1, last = gauges[i];
    for (let j = i + 1; j < gauges.length; j++) {
      const g = gauges[j], step = g.y0 - last.y0;
      if (Math.abs(g.x0 - last.x0) <= 4 && step >= 14 * s && step <= 20 * s) { n++; last = g; }
    }
    most = Math.max(most, n);
  }
  return { n: Math.max(1, most), sure: true };
}

/* ---------- inventory mesos: the white box at the bottom of the inventory window, with MESOS to its right ---------- */

// The box and its label are measured from the window's own background picture (InvBg). On screen the box is found as
// a row of white exactly as wide as the box (its width gives the stretch, so no EXP line is needed), confirmed by the
// MESOS label beside it. Digits are dark on white, cut apart by columns and matched against MesoDigits, learned from
// real frames (npm run boss:meso-seeds).
let inv = null;
function invGeometry() {
  if (inv || !raw.inv) return inv;
  const im = raw.inv, g = ctx2d(im.width, im.height); g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, im.width, im.height).data, W = im.width, H = im.height, white = i => Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) >= 236 && d[i * 4 + 3] > 200;
  // the box: a white run in the bottom bar that isn't a full width border line, and at least 8 rows tall
  let box = null, y0 = 0, y1 = 0;
  for (let y = H - 1; y > H - 45 && !box; y--) {
    let st = -1;
    for (let x = 0; x <= W && !box; x++) {
      const on = x < W && white(y * W + x); if (on && st < 0) st = x;
      if (!on && st >= 0) {
        if (x - st > 100 && x - st < W - 30) {
          let a = y, z = y; const mid = st + 2;
          while (a > 0 && white((a - 1) * W + mid)) a--;
          while (z < H - 1 && white((z + 1) * W + mid)) z++;
          if (z - a + 1 >= 8) { box = { x0: st, x1: x - 1 }; y0 = a; y1 = z; }
        }
        st = -1;
      }
    }
  }
  if (!box) return null;
  // the label: everything right of the box on the same rows, as luminance with a mask on its solid pixels
  const lx = box.x1 + 3, lw = W - 3 - lx, lh = y1 - y0 + 1;
  inv = { fw: box.x1 - box.x0 + 1, fh: lh, fx0: box.x0, fy0: y0, label: { dx: lx - box.x0, dy: 0, w: lw, h: lh, im } };
  inv.label.src = { x: lx, y: y0 };
  return inv;
}
function labelAt(s) {
  const key = 'label' + s.toFixed(3);
  if (cache.has(key)) return cache.get(key);
  const G = invGeometry(), L = G.label, w = Math.max(1, Math.round(L.w * s)), h = Math.max(1, Math.round(L.h * s)), g = ctx2d(w, h);
  g.imageSmoothingEnabled = true; g.drawImage(L.im, L.src.x, L.src.y, L.w, L.h, 0, 0, w, h);
  const dd = g.getImageData(0, 0, w, h).data, TL = new Float32Array(w * h), idx = [];
  let sm = 0, ss = 0;
  for (let i = 0; i < w * h; i++) { TL[i] = lumAt(dd, i * 4); if (dd[i * 4 + 3] > 230) { idx.push(i); sm += TL[i]; ss += TL[i] * TL[i]; } }
  const mean = sm / idx.length, t = { w, h, L: TL, idx, mean, v: ss / idx.length - mean * mean };
  cache.set(key, t); return t;
}
// the meso box on screen: { x, y, w, h, s } or null
let lastBox = null;
function confirmBox(src, x0, yRow, len) {
  const G = invGeometry(), s = (len + 1) / G.fw, t = labelAt(s);
  // the row may be any row inside the box; look for the label beside it over the box's height
  const ax = Math.round(x0 + G.label.dx * s) - 4, ay = Math.round(yRow - G.fh * s) - 2;
  const img = region(src, ax, ay, t.w + 8, t.h + Math.round(2 * G.fh * s) + 4);
  const b = best(img, { l: t }, ['l'], 0, img.w - t.w, 0, img.h - t.h, 1);
  if (b.score < 0.5) return null;
  return { x: x0, y: img.y + b.y, w: Math.round(G.fw * s), h: Math.round(G.fh * s), s, score: b.score };
}
function findMesoBox(src) {
  const G = invGeometry(); if (!G) return null;
  const { w: W, h: H } = sizeOf(src);
  if (lastBox) {   // the window seldom moves: check where it was first
    const c = confirmBox(src, lastBox.x, lastBox.y + Math.round(lastBox.h / 2), lastBox.w - 1);
    if (c) return (lastBox = c);
  }
  const g = ctx2d(W, H); g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, W, H).data, white = i => Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) >= 236, tried = [];
  for (let y = 2; y < H - 2; y += 2) {
    let st = -1;
    for (let x = 0; x <= W; x++) {
      const on = x < W && white(y * W + x);
      if (on && st < 0) st = x;
      if (on || st < 0) continue;
      const len = x - st, s = len / G.fw;
      if (s >= 0.7 && s <= 3.4 && !tried.some(q => Math.abs(q[0] - st) < 4 && Math.abs(q[1] - len) < 4 && Math.abs(q[2] - y) < 40)) {
        tried.push([st, len, y]);
        const c = confirmBox(src, st, y, len);
        if (c) return (lastBox = c);
      }
      st = -1;
    }
  }
  lastBox = null;
  return null;
}
// the dark marks inside the box, cut apart by empty columns: [{ x0, x1, y0, y1, g, a, comma }]
const MGW = 7, MGH = 11;
function mesoGlyphs(src, box) {
  const ins = Math.max(2, Math.round(1.5 * box.s)), img = region(src, box.x + ins, box.y + ins, box.w - 2 * ins, box.h - 2 * ins);
  const W = img.w, H = img.h, dk = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) dk[i] = Math.max(0, Math.min(1, (235 - img.L[i]) / 150));
  const col = []; for (let x = 0; x < W; x++) { let n = 0; for (let y = 0; y < H; y++) if (dk[y * W + x] > 0.35) n++; col.push(n); }
  const parts = []; let st = -1;
  for (let x = 0; x <= W; x++) { const on = x < W && col[x] > 0; if (on && st < 0) st = x; if (!on && st >= 0) { parts.push([st, x - 1]); st = -1; } }
  const glyphs = parts.map(([x0, x1]) => {
    let y0 = H, y1 = -1; for (let y = 0; y < H; y++) for (let x = x0; x <= x1; x++) if (dk[y * W + x] > 0.35) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { x0, x1, y0, y1 };
  });
  const tall = Math.max(0, ...glyphs.map(q => q.y1 - q.y0 + 1));
  return glyphs.map(q => {
    const w = q.x1 - q.x0 + 1, h = q.y1 - q.y0 + 1;
    q.comma = h < 0.55 * tall && q.y1 > tall * 0.6;
    q.g = Array.from(gridOf(dk, W, H, q.x0, q.y0, w, h, MGW, MGH));
    q.a = w / h; q.h = h; q.tall = tall;
    return q;
  });
}
const MESO_SURE = 0.03, MESO_RATIO = 1.6;
function classifyMeso(q) {
  const per = {};
  for (const [lab, list] of Object.entries(raw.mesoDigits || {})) for (const t of list) {
    let e = 0; for (let i = 0; i < q.g.length; i++) e += (q.g[i] - t.g[i]) ** 2;
    e = e / q.g.length + 0.3 * (q.a - t.a) ** 2;
    if (per[lab] == null || e < per[lab]) per[lab] = e;
  }
  const r = Object.entries(per).sort((a, b) => a[1] - b[1]);
  return r.length ? { d: r[0][0], dist: r[0][1], second: r[1] ? r[1][1] : 9 } : { d: null, dist: 9, second: 9 };
}
// { ok, value, box } or { ok: false, reason }: 'no inventory', 'unsure' (a digit not clearly one), 'bad commas'
function readMesos(src) {
  const box = findMesoBox(src);
  if (!box) return { ok: false, reason: 'no inventory' };
  const gs = mesoGlyphs(src, box).filter(q => q.h >= 0.25 * q.tall);
  if (!gs.length) return { ok: false, reason: 'unsure', box };
  let text = '';
  for (const q of gs) {
    if (q.comma) { text += ','; continue; }
    const c = classifyMeso(q);
    if (!c.d || c.dist > MESO_SURE * 2 || (c.dist > MESO_SURE && c.second < MESO_RATIO * c.dist)) return { ok: false, reason: 'unsure', box };
    text += c.d;
  }
  // a real total has its commas exactly every three digits from the right
  if (!/^\d{1,3}(,\d{3})*$/.test(text)) return { ok: false, reason: 'bad commas', box, text };
  return { ok: true, value: parseInt(text.replace(/,/g, ''), 10), box };
}

/* ---------- inventory slots: the open tab, and each slot's count and item ---------- */

// The window is placed from its meso box; its 5x6 slot grid and tab bar are fixed in the window's own picture.
const SLOT = { x0: 9, y0: 51, w: 31, h: 31, px: 36, py: 34, cols: 5, rows: 6 };   // measured from Item.img backgrnd
const TABS = ['Equip', 'Use', 'Setup', 'Etc', 'Cash', 'Deco'];
function windowOf(box) {
  const G = invGeometry();
  return { x: box.x - G.fx0 * box.s, y: box.y - G.fy0 * box.s, s: box.s };
}
// the open tab is the pink one in the tab bar
function readTab(src, win) {
  const s = win.s, img = region(src, win.x + 4 * s, win.y + 21 * s, 201 * s, 16 * s), d = img.data;
  let sum = 0, n = 0;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const k = (y * img.w + x) * 4;
    if (d[k] > 170 && d[k + 1] < 150 && d[k + 2] < 170 && d[k] - d[k + 1] > 50) { sum += x; n++; }
  }
  if (n < 20 * s) return null;
  return TABS[Math.max(0, Math.min(5, Math.floor((sum / n / s + 4 - 5) / 33.5)))];
}
// the count digits' own stretch on this window (the stretch is measured from the box, the digits round a little smaller)
const SLOT_MORE = 0.6;
let slotSc = { s: 0, sc: 0 }, slotCache = { key: '', slots: {} };   // the item in each slot, while its count stays
function slotRect(win, r, c) { const s = win.s; return { x: win.x + (SLOT.x0 + c * SLOT.px) * s, y: win.y + (SLOT.y0 + r * SLOT.py) * s, w: SLOT.w * s, h: SLOT.h * s }; }
// the number at the bottom left of a slot, or null
function slotNumber(src, rect, sc) {
  const set = setAt('count', sc), t0 = set['0'];
  const img = region(src, rect.x - 3, rect.y + rect.h - t0.h - 6, Math.min(rect.w, t0.w * 4) + 6, t0.h + 9);
  let first = { score: -1 };
  for (const d of SLOT_KEYS) { const b = best(img, set, [d], 0, Math.min(8, img.w - set[d].w), 0, img.h - set[d].h); if (b.score > first.score) first = b; }
  if (first.score < NEXT) return null;
  const n = [first];
  for (let k = 0; k < 4; k++) {
    const l = n[n.length - 1], r = best(img, set, SLOT_KEYS, l.x + l.t.w - 2, l.x + l.t.w + 2, l.y - 1, l.y + 1);
    if (r.score >= NEXT) { n.push(r); continue; }
    // something digit like right after the last digit: the number may be longer than read (12 read as 1), so none
    if (r.score >= SLOT_MORE) return null;
    break;
  }
  // a slot's count sits at an exact spot (empty slots score about 0.35), so 0.8 is enough here; the quickslot
  // reader wants one digit at 0.85 because its search area also holds key labels
  return { value: parseInt(n.map(q => q.d[0]).join(''), 10), score: Math.min(...n.map(q => q.score)) };
}
// the item in a slot, by colour against an icon set, at base size, ignoring the bottom rows where the count is drawn
function slotIcon(src, rect, s, set) {
  const W = 37, H = 37, g = ctx2d(W, H); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(src, rect.x - 3 * s, rect.y - 3 * s, W * s, H * s, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  let top = { id: null, diff: 1e9 };
  for (const [id, t] of Object.entries(set)) {
    for (let y = 0; y + t.h <= H; y++) for (let x = 0; x + t.w <= W; x++) {
      const n = t.idx.length, base = y * W + x, cap = top.diff * n * 3;
      let sum = 0, j = 0;
      for (; j < n && sum <= cap; j++) {
        const i = t.idx[j], k = (base + ((i / t.w) | 0) * W + (i % t.w)) * 4, q = i * 4;
        sum += Math.abs(d[k] - t.d[q]) + Math.abs(d[k + 1] - t.d[q + 1]) + Math.abs(d[k + 2] - t.d[q + 2]);
      }
      if (j < n) continue;
      const diff = sum / (n * 3);
      if (diff < top.diff) top = { id, diff };
    }
  }
  return top;
}
let etcIcons = null;
function iconsOf(kind) {
  if (kind === 'Use') return iconSet();
  if (kind === 'Etc') {
    if (!etcIcons) { etcIcons = {}; for (const [id, im] of Object.entries(raw.etcIcon || {})) etcIcons[id] = iconFrom(im); }
    return etcIcons;
  }
  return null;
}
// { ok, tab, box, slots: [{ r, c, value, id, diff }] } or { ok: false, reason }
function readInventory(src) {
  const box = findMesoBox(src);
  if (!box) return { ok: false, reason: 'no inventory' };
  const win = windowOf(box), tab = readTab(src, win);
  if (!tab) return { ok: false, reason: 'no tab', box };
  if (Math.abs(slotSc.s - box.s) > 0.001) {
    // fine tune the count stretch once per window size on the slots that have a number
    let bestSc = { sc: box.s * 0.975, score: -1 };
    for (let sc = box.s * 0.95; sc <= box.s * 1.01; sc += 0.0125) {
      const scores = [];
      for (let r = 0; r < 2; r++) for (let c = 0; c < SLOT.cols; c++) { const n = slotNumber(src, slotRect(win, r, c), sc); if (n) scores.push(n.score); }
      const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      if (mean > bestSc.score) bestSc = { sc, score: mean };
    }
    slotSc = { s: box.s, sc: bestSc.sc };
  }
  const icons = iconsOf(tab), slots = [], cacheKey = tab + Math.round(box.x) + ',' + Math.round(box.y);
  if (slotCache.key !== cacheKey) slotCache = { key: cacheKey, slots: {} };
  for (let r = 0; r < SLOT.rows; r++) for (let c = 0; c < SLOT.cols; c++) {
    const rect = slotRect(win, r, c), n = slotNumber(src, rect, slotSc.sc);
    if (!n) continue;
    const q = { r, c, value: n.value, id: null, diff: null };
    const kept = slotCache.slots[r + ',' + c];
    if (kept && kept.value === n.value) { q.id = kept.id; q.diff = kept.diff; }
    else if (icons) { const ic = slotIcon(src, rect, box.s, icons); q.diff = ic.diff; if (ic.diff < 75) q.id = +ic.id; }
    slotCache.slots[r + ',' + c] = { value: q.value, id: q.id, diff: q.diff };
    slots.push(q);
  }
  return { ok: true, tab, box, slots };
}

window.MapleScreen = { load, sizeOf, findExpLine, readExp, expGlyphs, measure, readLevel, readCounts, readIcon, readParty, levelArea, slotArea, partyArea,
  findMesoBox, mesoGlyphs, readMesos, invGeometry, readInventory };
})();

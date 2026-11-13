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
const EXP_SEEDS = {"0":[{"g":[0,40,130,140,143,116,23,0,25,108,204,203,203,183,90,17,149,135,43,42,41,56,154,107,224,153,0,0,0,21,174,163,216,153,0,0,0,22,175,154,217,153,0,0,0,22,175,152,215,153,0,0,0,21,174,151,215,153,0,0,0,20,173,150,221,153,0,0,0,18,171,158,155,131,17,13,11,31,157,109,28,100,185,189,188,168,89,19,0,42,146,162,166,128,22,0],"a":0.71},{"g":[0,9,103,146,140,140,53,1,9,72,166,202,203,202,117,37,67,165,70,40,42,40,120,173,108,203,50,0,0,0,132,248,98,203,50,0,0,0,130,247,96,202,49,0,0,0,131,248,94,202,49,0,0,0,130,247,94,202,49,0,0,0,130,247,100,201,48,0,0,0,131,248,67,172,49,10,12,12,110,182,10,73,154,187,188,188,112,42,0,6,114,169,161,159,59,1],"a":0.71},{"g":[0,39,164,211,211,198,142,0,63,93,78,70,70,69,73,116,106,126,37,0,0,3,36,188,128,137,40,0,0,0,31,216,128,136,39,0,0,0,31,216,127,136,39,0,0,0,31,216,126,136,39,0,0,0,31,216,125,135,39,0,0,0,31,216,125,134,39,0,0,0,31,216,107,122,36,0,0,0,28,195,66,89,70,61,61,57,58,123,0,35,142,183,183,171,122,0],"a":0.78}],"1":[{"g":[0,0,0,33,64,154,68,11,5,20,43,147,190,255,145,71,52,109,196,243,255,255,133,52,43,74,119,200,227,255,129,46,0,2,5,108,158,255,131,48,0,0,0,99,150,255,132,49,0,0,0,104,155,255,130,47,0,0,0,103,154,255,130,47,0,0,0,102,153,255,129,45,0,0,0,105,156,255,130,46,0,0,0,118,169,255,138,60,0,0,0,39,75,178,77,9],"a":0.36},{"g":[0,0,0,0,124,124,88,88,25,25,55,55,255,255,219,219,149,149,219,219,255,255,193,193,99,99,162,162,255,255,189,189,0,0,26,26,255,255,198,198,0,0,0,0,255,255,203,203,0,0,0,0,255,255,206,206,0,0,0,0,255,255,205,205,0,0,0,0,255,255,204,204,0,0,0,0,255,255,208,208,0,0,0,0,255,255,226,226,0,0,0,0,145,145,98,98],"a":0.29},{"g":[0,0,21,21,165,165,23,23,40,40,145,145,255,255,102,102,189,189,248,248,255,255,80,80,117,117,207,207,255,255,75,75,4,4,101,101,255,255,79,79,0,0,89,89,255,255,81,81,0,0,95,95,255,255,81,81,0,0,94,94,255,255,80,80,0,0,92,92,255,255,78,78,0,0,94,94,255,255,79,79,0,0,111,111,255,255,96,96,0,0,24,24,193,193,18,18],"a":0.29},{"g":[0,0,0,0,91,91,122,122,16,16,48,48,236,236,255,255,107,107,205,205,255,255,253,253,75,75,140,140,251,251,253,253,0,0,16,16,214,214,255,255,0,0,0,0,214,214,255,255,0,0,0,0,220,220,255,255,0,0,0,0,220,220,255,255,0,0,0,0,219,219,255,255,0,0,0,0,222,222,255,255,0,0,0,0,241,241,255,255,0,0,0,0,106,106,137,137],"a":0.29},{"g":[0,0,0,0,46,46,149,149,7,7,44,44,182,182,255,255,61,61,197,197,255,255,255,255,47,47,122,122,223,223,255,255,0,0,7,7,143,143,255,255,0,0,0,0,136,136,255,255,0,0,0,0,141,141,255,255,0,0,0,0,141,141,255,255,0,0,0,0,140,140,255,255,0,0,0,0,142,142,255,255,0,0,0,0,159,159,255,255,0,0,0,0,55,55,175,175],"a":0.29},{"g":[0,0,0,0,137,137,111,111,0,0,16,16,244,244,189,189,82,82,212,212,255,255,175,175,27,27,121,121,255,255,174,174,0,0,26,26,237,237,181,181,0,0,0,0,236,236,187,187,0,0,0,0,244,244,188,188,0,0,0,0,244,244,188,188,0,0,0,0,244,244,188,188,0,0,0,0,246,246,189,189,0,0,0,0,255,255,196,196,0,0,0,0,255,255,200,200],"a":0.36},{"g":[0,0,0,0,202,202,46,46,0,0,70,70,250,250,95,95,155,155,223,223,255,255,83,83,52,52,151,151,255,255,80,80,0,0,41,41,255,255,83,83,0,0,0,0,255,255,85,85,0,0,0,0,255,255,85,85,0,0,0,0,255,255,84,84,0,0,0,0,255,255,82,82,0,0,0,0,255,255,82,82,0,0,0,0,255,255,89,89,0,0,0,0,255,255,95,95],"a":0.36}],"2":[{"g":[1,43,148,142,142,138,36,1,52,126,203,203,203,202,104,40,194,121,42,43,42,40,130,178,137,52,0,0,0,0,150,248,16,0,0,0,0,0,136,244,0,0,0,0,39,157,124,43,0,0,3,22,96,193,56,1,0,0,27,157,154,26,0,0,1,32,105,114,64,3,0,0,15,137,211,69,0,6,18,16,189,234,246,208,182,185,191,190,156,156,145,151,156,158,170,148],"a":0.64},{"g":[0,7,102,146,140,141,55,1,12,74,167,203,203,203,119,39,74,176,78,42,43,41,117,174,59,114,23,0,0,0,129,247,4,12,0,0,0,0,114,230,0,0,0,0,17,127,132,45,0,0,0,10,59,174,83,0,0,0,0,80,209,39,0,0,0,7,73,100,101,0,0,0,1,51,200,138,0,4,17,13,72,204,246,230,182,184,191,189,40,162,149,147,155,158,168,145],"a":0.71},{"g":[0,56,229,209,216,208,0,0,5,120,233,227,228,212,69,0,210,131,43,42,42,39,198,158,133,36,0,0,0,0,237,201,32,0,0,0,0,0,206,158,0,0,0,0,34,139,104,60,0,0,0,37,91,191,19,0,0,0,0,144,129,73,0,0,0,14,58,185,96,0,0,0,6,80,220,12,5,9,13,0,54,209,255,86,47,66,89,21,255,255,255,255,255,255,255,213],"a":0.73},{"g":[0,0,186,218,209,225,77,0,0,61,201,229,227,231,130,8,161,221,37,42,42,42,81,210,69,117,0,0,0,0,67,255,8,24,0,0,0,0,80,255,0,0,0,0,0,138,127,116,0,0,0,0,59,195,94,0,0,0,0,48,176,79,10,0,0,0,59,115,185,0,0,0,0,20,222,89,2,8,11,13,16,126,255,181,33,62,78,87,174,255,255,255,255,255,255,255],"a":0.73}],"3":[{"g":[0,50,138,140,146,106,12,0,38,116,204,204,202,171,78,11,179,132,45,43,41,66,163,77,126,68,0,0,0,42,195,127,9,4,0,0,0,40,193,107,0,0,7,157,207,157,62,14,0,0,14,179,219,171,62,12,0,0,0,0,0,38,191,95,103,54,0,0,0,38,191,120,185,121,18,13,10,43,170,76,43,111,191,189,187,157,78,12,0,55,156,161,168,118,10,0],"a":0.71},{"g":[0,102,225,209,220,164,0,0,16,145,231,227,229,183,42,0,212,70,42,42,42,34,217,99,151,14,0,0,0,0,255,130,41,0,0,0,0,0,238,103,0,0,2,139,139,126,104,39,0,0,2,192,189,166,48,0,0,0,0,74,71,56,160,51,70,1,0,0,0,0,255,139,242,22,10,10,9,11,236,111,168,105,71,73,70,78,136,10,0,183,255,255,255,255,0,0],"a":0.73},{"g":[0,102,255,255,255,255,102,0,73,117,182,182,182,182,117,73,255,153,0,0,0,0,153,255,109,66,0,0,0,0,153,255,0,0,0,0,0,0,153,255,0,0,0,175,219,219,109,36,0,0,0,175,219,219,109,36,0,0,0,0,0,0,153,255,109,66,0,0,0,0,153,255,255,153,0,0,0,0,153,255,73,117,182,182,182,182,117,73,0,102,255,255,255,255,102,0],"a":0.71},{"g":[0,102,255,255,255,255,102,0,73,117,182,182,182,182,117,73,255,153,0,0,0,0,153,255,109,66,0,0,0,0,153,255,0,0,0,0,0,0,153,255,0,0,0,175,219,219,109,36,0,0,0,175,219,219,109,36,0,0,0,0,0,0,153,255,109,66,0,0,0,0,153,255,255,153,0,0,0,0,153,255,73,117,182,182,182,182,117,73,0,102,255,255,255,255,102,0],"a":0.71},{"g":[0,0,63,76,71,67,39,0,0,55,190,239,238,235,193,0,157,162,80,46,46,46,68,209,86,77,22,0,0,0,36,255,17,13,4,0,0,1,39,249,0,0,0,79,139,139,136,112,0,0,0,80,140,143,141,94,4,2,0,1,1,6,47,225,67,57,16,0,0,0,36,255,176,170,81,46,46,45,64,209,0,52,190,241,240,230,176,0,0,0,78,96,91,85,47,0],"a":0.64}],"4":[{"g":[0,0,0,0,6,108,68,5,0,0,0,15,78,208,165,15,0,0,7,89,210,249,147,13,0,20,94,110,154,232,143,12,3,72,202,87,30,187,147,13,125,117,35,12,9,175,135,11,252,199,36,35,71,203,176,49,224,246,242,233,240,254,255,246,86,128,122,118,139,224,209,133,0,0,0,0,24,184,142,12,0,0,0,0,36,191,159,15,0,0,0,0,6,126,73,5],"a":0.64},{"g":[0,0,0,0,25,110,34,0,0,0,0,18,95,238,85,0,0,0,0,111,227,228,75,0,0,25,86,113,174,226,73,0,0,72,202,53,69,229,76,0,97,123,46,7,51,224,71,0,194,179,47,35,87,234,103,20,170,246,242,233,244,255,250,130,66,129,124,117,151,242,167,63,0,0,0,0,51,226,73,0,0,0,0,0,51,238,85,0,0,0,0,0,29,125,37,0],"a":0.71},{"g":[0,0,0,0,31,111,27,0,0,0,0,22,114,225,72,0,0,0,5,128,233,216,63,0,0,29,91,117,184,214,61,0,1,82,194,45,74,217,64,0,109,110,39,6,51,212,59,0,220,169,37,35,107,225,94,17,193,246,242,232,249,255,250,113,75,128,124,116,160,238,162,54,0,0,0,0,56,214,61,0,0,0,0,0,68,225,72,0,0,0,0,0,36,126,28,0],"a":0.71},{"g":[0,0,0,0,0,157,93,0,0,0,0,0,29,246,164,0,0,0,0,82,214,255,149,0,0,0,102,105,109,255,148,0,0,16,211,76,20,254,154,0,69,133,114,26,0,247,143,0,140,238,46,34,42,248,177,41,144,255,158,140,151,255,239,150,90,185,185,185,185,253,229,185,0,0,0,0,0,248,158,0,0,0,0,0,0,255,151,0,0,0,0,0,0,255,171,0],"a":0.73}],"5":[{"g":[131,137,133,137,137,137,147,132,254,235,197,202,203,203,206,203,247,147,29,39,43,42,48,41,242,107,0,0,0,0,0,0,242,106,0,0,0,0,0,0,44,125,197,198,202,193,42,0,3,72,219,219,219,213,114,37,4,0,0,0,0,0,125,222,110,43,0,0,0,0,146,248,208,103,13,13,11,13,124,189,59,116,189,188,188,189,97,45,1,47,171,164,164,160,40,1],"a":0.64},{"g":[113,138,134,137,137,141,150,44,255,235,201,203,203,204,208,101,251,158,37,41,42,45,51,11,248,131,0,0,0,0,0,0,223,121,0,0,0,0,0,0,43,120,187,198,206,148,18,0,0,75,206,219,219,177,67,12,0,0,0,0,0,40,193,92,104,52,0,0,0,41,194,114,187,117,18,13,11,45,170,69,44,112,191,189,188,156,77,11,0,56,157,161,168,117,9,0],"a":0.71},{"g":[0,79,62,67,67,65,84,7,83,239,237,238,238,238,239,125,73,255,46,46,46,46,46,25,79,255,0,0,0,0,0,0,51,224,0,0,0,0,0,0,15,94,139,139,139,139,0,0,0,0,139,141,139,139,77,18,0,15,0,3,0,0,200,71,32,99,0,0,0,0,249,122,96,209,46,46,46,46,193,89,0,0,240,240,240,241,14,0,0,0,88,93,90,104,0,0],"a":0.73}],"6":[{"g":[1,56,141,140,147,100,7,0,39,120,203,203,203,166,73,11,174,117,41,43,42,79,176,73,244,121,0,0,0,24,111,57,243,118,0,0,0,0,11,4,253,218,179,194,206,140,12,0,254,230,210,218,219,173,63,7,245,122,0,0,0,48,201,60,244,119,0,0,0,51,204,86,184,107,12,13,10,50,172,59,44,114,188,189,187,151,70,10,1,61,161,161,168,112,6,0],"a":0.71},{"g":[0,0,200,216,209,227,60,0,0,66,213,229,227,233,124,6,151,206,39,42,42,43,123,210,182,234,0,0,0,0,33,131,172,237,0,0,0,0,0,31,166,248,139,139,139,139,57,0,169,255,177,182,188,185,105,44,176,243,53,60,68,65,100,154,187,231,0,0,0,0,87,255,175,228,10,10,10,8,88,234,46,120,71,71,73,65,100,125,0,0,255,255,255,255,118,0],"a":0.73},{"g":[0,0,179,218,209,227,84,0,0,53,194,229,227,232,137,13,131,219,35,42,42,42,95,211,157,255,0,0,0,0,23,141,146,255,0,0,0,0,0,36,138,255,139,139,139,139,75,0,136,255,183,181,188,186,123,50,140,255,62,58,68,66,84,163,150,255,0,0,0,0,47,255,143,235,10,9,10,9,54,236,34,131,74,70,73,68,97,139,0,0,255,255,255,255,153,0],"a":0.73},{"g":[0,104,185,211,210,174,77,0,120,84,73,70,70,74,88,91,196,71,14,0,0,16,64,105,229,66,11,0,0,0,6,40,232,115,31,5,5,4,0,0,232,200,171,161,161,130,45,0,231,202,174,165,165,141,72,31,229,120,40,16,17,36,81,93,229,58,9,0,0,22,92,178,206,60,10,0,0,21,87,157,130,72,61,61,61,65,78,97,0,95,162,183,183,153,66,0],"a":0.78},{"g":[0,95,225,209,218,171,0,0,10,138,231,227,229,191,50,0,211,59,42,42,42,35,219,141,255,26,0,0,0,0,117,52,255,49,0,0,0,0,24,3,255,169,139,139,139,139,0,0,255,215,175,188,186,184,54,4,255,108,50,68,66,63,169,60,255,9,0,0,0,0,255,149,238,36,9,10,9,11,235,127,147,94,68,73,70,79,131,24,0,174,255,255,255,255,0,0],"a":0.73},{"g":[0,118,223,209,220,146,0,0,19,156,230,227,231,176,38,0,212,33,42,42,42,33,216,112,255,1,0,0,0,0,127,37,255,21,0,0,0,0,29,0,255,154,139,139,139,123,0,0,255,205,177,188,187,168,55,0,255,93,53,68,67,64,170,41,255,0,0,0,0,0,255,112,238,14,9,10,9,12,237,90,147,89,66,73,68,82,142,6,0,209,255,255,255,255,0,0],"a":0.73}],"7":[{"g":[232,216,209,209,206,197,213,65,250,234,227,227,215,218,251,134,46,43,42,42,39,40,255,132,0,0,0,0,0,0,255,133,0,0,0,0,0,0,255,134,0,0,0,0,0,0,255,144,0,0,0,0,3,54,192,87,0,0,0,0,58,169,74,4,0,0,0,69,131,185,0,0,0,0,0,254,91,0,0,0,0,0,0,255,89,0,0,0,0,0,0,255,95,0,0,0],"a":0.73},{"g":[42,74,70,67,66,65,66,83,210,235,238,238,238,238,238,239,41,46,46,46,46,46,76,255,0,0,0,0,0,0,36,255,0,0,0,0,0,0,36,255,0,0,0,0,0,0,36,255,0,0,0,0,14,45,89,146,0,0,0,7,46,107,129,10,0,0,0,54,101,101,66,0,0,0,0,146,176,51,0,0,0,0,0,137,172,58,0,0,0,0,0,52,52,0,0,0],"a":0.64},{"g":[56,74,70,67,66,65,66,74,237,239,238,238,238,238,238,239,46,46,46,46,46,54,98,255,0,0,0,0,0,4,49,255,0,0,0,0,0,4,49,255,0,0,0,0,0,4,48,255,0,0,0,0,19,54,88,142,0,0,0,9,58,118,112,4,0,0,0,58,103,92,48,0,0,0,0,146,155,16,0,0,0,0,0,138,155,29,0,0,0,0,0,63,63,0,0,0],"a":0.64},{"g":[91,232,209,209,209,204,202,200,95,250,227,227,227,209,250,250,17,46,42,42,42,38,82,255,0,0,0,0,0,0,50,255,0,0,0,0,0,0,57,255,0,0,0,0,0,0,58,255,0,0,0,0,0,33,84,188,0,0,0,0,0,138,126,68,0,0,0,19,66,185,102,0,0,0,0,78,245,1,0,0,0,0,0,119,255,0,0,0,0,0,0,116,255,0,0,0],"a":0.73}],"8":[{"g":[1,33,137,143,142,152,47,2,37,95,203,203,203,202,128,50,174,138,42,42,42,40,105,187,250,165,0,0,0,0,103,241,236,144,0,0,0,0,97,240,38,94,174,197,197,194,116,43,33,89,198,219,219,219,115,42,214,135,0,0,0,0,92,239,250,163,0,0,0,0,98,241,185,134,14,11,12,8,91,200,42,91,189,188,188,186,118,56,1,36,155,165,163,174,50,2],"a":0.64},{"g":[1,42,147,142,142,140,37,1,46,120,202,203,203,202,107,41,183,115,39,41,41,40,128,178,244,122,0,0,0,0,145,247,243,111,0,0,0,0,128,245,42,110,187,197,197,180,100,41,39,110,217,219,219,206,99,36,233,104,0,0,0,0,123,222,244,119,0,0,0,0,143,247,196,106,10,12,12,13,120,191,52,111,187,188,188,189,99,47,1,46,169,164,164,161,41,1],"a":0.64},{"g":[0,50,138,140,146,106,12,0,34,112,203,203,202,171,78,11,170,126,41,43,41,66,163,77,252,143,0,0,0,42,195,127,222,125,0,0,0,40,193,107,38,102,179,197,196,157,62,14,31,99,201,219,219,171,62,12,203,118,0,0,0,38,191,95,251,142,0,0,0,38,191,120,179,118,13,12,10,43,170,76,37,106,189,188,187,157,78,12,0,55,156,161,168,118,10,0],"a":0.71},{"g":[0,118,223,209,220,146,0,0,19,156,230,227,229,175,35,0,212,33,42,42,42,32,216,91,255,1,0,0,0,0,255,115,255,20,0,0,0,1,252,85,116,111,139,139,139,116,114,30,50,138,185,188,185,157,49,0,162,58,64,68,65,58,161,41,255,0,0,0,0,0,255,112,238,14,9,10,9,12,237,90,147,89,66,73,68,82,142,6,0,209,255,255,255,255,0,0],"a":0.73}],"9":[{"g":[1,41,146,142,142,143,39,1,45,117,202,203,203,202,109,42,182,120,40,41,41,40,124,180,245,129,0,0,0,0,132,245,243,117,0,0,0,0,133,246,44,120,193,198,190,176,228,254,3,66,219,219,218,207,235,254,3,0,0,0,0,0,136,246,110,48,0,0,0,0,128,245,205,113,15,13,12,12,115,192,56,111,190,189,188,188,102,48,1,45,167,164,164,163,42,1],"a":0.64},{"g":[0,35,126,140,142,121,29,0,22,101,196,203,203,191,97,21,136,138,44,42,42,48,144,125,211,153,0,0,0,3,156,187,181,158,5,0,0,10,163,172,31,96,175,198,190,188,237,166,0,52,183,219,216,214,243,165,0,1,0,0,0,15,168,170,81,67,0,0,0,1,154,181,142,149,24,13,11,21,144,129,31,100,180,188,188,173,93,24,0,35,140,163,164,135,30,0],"a":0.71},{"g":[1,33,137,143,142,152,47,2,37,95,203,203,203,202,128,50,174,138,42,42,42,40,105,187,250,165,0,0,0,0,96,240,236,144,0,0,0,0,100,241,40,109,182,198,192,173,222,253,0,45,208,219,219,206,230,253,0,0,0,0,0,0,105,242,107,61,0,0,0,0,91,240,195,134,19,13,12,8,91,200,47,96,192,189,188,186,118,56,1,36,155,165,163,174,50,2],"a":0.64}],"%":[{"g":[0,94,34,0,0,0,49,88,32,181,87,12,0,15,124,137,160,69,145,65,0,87,137,23,114,95,125,42,46,127,67,0,9,169,72,0,129,112,4,0,0,26,9,95,107,18,0,0,0,0,27,152,61,13,17,0,0,5,143,76,0,101,120,0,0,86,114,31,54,115,114,64,16,154,51,0,100,98,88,118,170,72,10,0,23,116,126,27,122,24,0,0,0,63,72,0],"a":1},{"g":[3,104,29,0,0,0,24,121,52,164,99,10,0,9,80,205,172,70,150,64,0,56,159,48,128,107,119,45,27,129,100,1,22,173,68,1,94,153,13,0,1,33,9,87,141,22,1,0,0,1,22,144,85,9,24,0,0,8,161,83,0,65,167,8,2,88,135,27,43,107,111,110,31,165,47,0,72,142,52,176,184,77,8,0,15,101,153,47,132,21,0,0,0,37,109,1],"a":0.93},{"g":[5,139,43,0,0,0,33,169,25,166,96,0,0,1,64,189,193,91,163,125,0,38,172,62,106,116,121,46,24,111,89,9,28,147,66,2,77,151,18,0,5,71,21,51,124,77,0,0,0,0,18,107,99,14,29,0,0,0,88,123,29,30,110,11,2,41,149,88,23,78,152,79,15,149,77,0,75,156,52,192,70,138,28,0,34,110,81,118,236,84,0,0,0,46,185,27],"a":1}]};
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
// A looser green for captures whose colours came out shifted (a Mac's colour managed screen share, 2026-11-11: a friend's
// EXP bar was never found there while the white mesos box read fine). Only tried when the exact green finds nothing.
const isGreenLoose = (r, g, b) => g > 130 && g > r + 12 && g > b + 55 && r >= 40;
const greenBrackets = (img, w, h, loose) => {
  const gm = new Uint8Array(w * h), test = loose ? isGreenLoose : isGreen;
  for (let i = 0; i < w * h; i++) { const k = i * 4; gm[i] = test(img.data[k], img.data[k + 1], img.data[k + 2]) ? 1 : 0; }
  return components(gm, w, h, 6).filter(c => c.h >= 7 && c.w <= 6 && c.h >= 2 * c.w).sort((a, b) => a.x0 - b.x0);
};
// the EXP line's box: the lowest pair of green brackets in the bottom part of the frame. line.loose says the looser green
// found it (expGlyphs then reads the brackets the same way)
function findExpLine(src, fw, fh) {
  const y0 = Math.floor(fh * 0.55), img = region(src, 0, y0, fw, fh - y0);
  for (const loose of [false, true]) {
    const cs = greenBrackets(img, img.w, img.h, loose), tol = loose ? 1 : 0;
    let o = null, c = null;
    for (let j = 0; j + 1 < cs.length; j++) {
      if (Math.abs(cs[j].y0 - cs[j + 1].y0) <= 1 && Math.abs(cs[j].h - cs[j + 1].h) <= tol && cs[j + 1].x0 - cs[j].x0 < 200 && (!o || cs[j].y0 >= o.y0)) { o = cs[j]; c = cs[j + 1]; }
    }
    if (!o) continue;
    const x = Math.max(0, o.x0 - 150), y = o.y0 + y0 - 6;
    return { x, y, w: Math.min(fw - x, (c.x1 - o.x0) + 160), h: o.h + 12, digitH: o.h, loose, ox: o.x0 };
  }
  return null;
}
// For a Something off? report when the EXP line isn't found: how many pixels pass the exact and the loose green in the
// bottom of the frame, and the average colour of the loose ones (a shifted colour profile shows as exact 0, loose many)
function greenProbe(src, fw, fh) {
  const y0 = Math.floor(fh * 0.55), img = region(src, 0, y0, fw, fh - y0), d = img.data;
  let exact = 0, loose = 0, r = 0, g = 0, b = 0;
  for (let i = 0; i < img.w * img.h; i++) {
    const k = i * 4;
    if (isGreen(d[k], d[k + 1], d[k + 2])) exact++;
    if (isGreenLoose(d[k], d[k + 1], d[k + 2])) { loose++; r += d[k]; g += d[k + 1]; b += d[k + 2]; }
  }
  return { exact, loose, avg: loose ? [Math.round(r / loose), Math.round(g / loose), Math.round(b / loose)] : null };
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
  const gc = greenBrackets(img, w, h, !!line.loose);
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
// inventory slots also come half a pixel down (a row of slots can sit at a fractional pixel too), and so do the
// quickslots at a stretch like kev's 1.33 (2026-11-12), so readCounts and fineCounts use these as well
const SLOT_KEYS = COUNT_KEYS.concat(DIGITS.map(d => d + '^'), DIGITS.map(d => d + '~^'));
// the level boxes too: in a 1920 wide window (stretch 1.39 and 1.56) the 5 of 53 fits 0.94 half a pixel over and down and
// under 0.8 without it, so 53 read as 5 (Rimmah's shots of every resolution, 2026-11-13)
const LEVEL_KEYS = SLOT_KEYS;
function load(pics) {
  const img = u => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = u; });
  const jobs = [];
  for (const [set, key] of [['ItemNo', 'count'], ['LevelNo', 'level'], ['Icons', 'icon']]) {
    for (const [k, u] of Object.entries(pics[set] || {})) jobs.push(img(u).then(i => { if (i) raw[key][k] = i; }));
  }
  if (pics.InvBg) jobs.push(img(pics.InvBg).then(i => { raw.inv = i; }));
  raw.etcIcon = {}; raw.cursor = {};
  for (const [k, u] of Object.entries(pics.EtcIcons || {})) jobs.push(img(u).then(i => { if (i) raw.etcIcon[k] = i; }));
  for (const [k, u] of Object.entries(pics.Cursor || {})) jobs.push(img(u).then(i => { if (i) raw.cursor[k] = i; }));
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
// true when s leaves every picture of a kind at its own size: the game drawn 1:1, as a window at 1366x768 or smaller is.
// measure snaps such a stretch to 1, so the level boxes and the counts agree (the counts fit from 0.955, where the level
// box is a row short and missed on Rimmah's 1280x720 window)
const atBase = (kind, s) => Object.values(raw[kind]).every(im => Math.round(im.width * s) === im.width && Math.round(im.height * s) === im.height);
const cache = new Map();
function setAt(kind, s) {
  const key = kind + s.toFixed(4);
  if (!cache.has(key)) {
    if (cache.size > 40) cache.clear();
    // the half pixel copies are for a stretched game; drawn 1:1 it never lands on half a pixel, and those blurred copies
    // fit the key labels ("Ins" read as 8888 at 0.94), so there they stand in for the plain picture and best() skips them
    const phased = kind === 'count' || kind === 'level', base = phased && atBase(kind, s);
    const set = {}; for (const [k, im] of Object.entries(raw[kind])) {
      set[k] = stretched(im, s);
      if (!phased) continue;
      if (base) { const same = Object.assign({}, set[k], { same: true }); set[k + '~'] = set[k + '^'] = set[k + '~^'] = same; continue; }
      set[k + '~'] = stretched(im, s, 0.5); set[k + '^'] = stretched(im, s, 0, 0.5); set[k + '~^'] = stretched(im, s, 0.5, 0.5);
    }
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
    if (t.same) continue;
    for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) {
      const sc = ncc(img, x, y, t); if (sc > b.score) b = { d: k, score: sc, x, y, t };
    }
  }
  return b;
}
// best() on every second pixel, then the 4 best distinct spots looked at again on every pixel around them. A step 2 scan
// alone hangs on its pixel phase: a level digit on an odd column scored under a wrong spot (0.70 against 0.93 at UI Size
// 85%, 2026-11-13), and every pixel costs 4 times as much (600 ms on a 2560x1440 frame). measure only falls back to it
// when the step 2 scan is weak, and keeps the scan's spot too, since the best spot can be the thin 1, which fits a wrong
// stretch (level-51 read 1.77 when this spot replaced the scan's)
function coarseBest(img, set, keys, x0, x1, y0, y1) {
  const spots = [];
  for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 2) {
    let sc = -1;
    for (const k of keys) { const v = ncc(img, x, y, set[k]); if (v > sc) sc = v; }
    const near = spots.find(p => Math.abs(p.x - x) < 6 && Math.abs(p.y - y) < 6);
    if (near) { if (sc > near.score) Object.assign(near, { x, y, score: sc }); continue; }
    if (spots.length < 4) spots.push({ x, y, score: sc });
    else { const low = spots.reduce((p, q) => (q.score < p.score ? q : p)); if (sc > low.score) Object.assign(low, { x, y, score: sc }); }
  }
  let b = { d: null, score: -1, x: 0, y: 0, t: null };
  for (const p of spots) {
    const r = best(img, set, keys, Math.max(x0, p.x - 1), Math.min(x1, p.x + 1), Math.max(y0, p.y - 1), Math.min(y1, p.y + 1));
    if (r.score > b.score) b = r;
  }
  return b;
}

/* ---------- stretch, level ---------- */

// patches relative to the EXP line, in base (1366x768) pixels. They were measured from line.x, which sits 150 screen
// pixels left of the green bracket, so on Rimmah's 1.82 frames 150 / 1.82 base pixels. atX keeps that spot in base
// pixels at any stretch: at kev's 1.33 the fixed 150 put every patch about 30 screen pixels too far left
const BRACKET = 150 / 1.82, atX = (line, s) => (line.ox != null ? line.ox : line.x + 150) - BRACKET * s;
const levelArea = (line, s) => ({ x: atX(line, s) - 470 * s, y: line.y - 20 * s, w: 210 * s, h: 60 * s + line.h });
const slotArea = (line, s) => ({ x: atX(line, s) + 190 * s, y: line.y - 128 * s, w: 220 * s, h: 106 * s });
// ROUGH only picks spots worth checking (a 6 over the White Potion's bright bottle scores under 0.55 against an 8);
// every spot must still match a real digit at DIGIT to count
const LEVEL = 0.8, DIGIT = 0.85, NEXT = 0.8, ROUGH = 0.45;

// { s, sc, score, countScore }: s for the level boxes, sc for the count digits (a pixel of rounding apart at these sizes).
// First guess the window height / 768, then the EXP digit height; find a level box there and fine tune on that spot.
function measure(src, line, frameH) {
  let top = { s: 0, score: -1 };
  const tries = [];
  // A windowed game at 1366x768 or smaller draws at exactly 1:1 (Rimmah's shots of every resolution, 2026-11-13), but its
  // share carries the title bar, so neither guess has to land near 1: try 1 last when neither did
  const guesses = [frameH / 768, line.digitH / 6.4];
  if (!guesses.some(g => Math.abs(g - 1) < 0.06)) guesses.push(1);
  for (const g0 of guesses) {
    const a = levelArea(line, g0), img = region(src, a.x, a.y, a.w, a.h), set = setAt('level', g0), t0 = set['0'];
    if (!t0) break;
    // a weak scan adds the fallback's spot beside its own, and both are fine tuned (on kev's 25 the scan's 5 fit 0.902
    // and the fallback's 2 fit 0.896), so a frame the scan reads well keeps what it read. Near 1:1 the digits are crisp 1 px
    // strokes that a step 2 scan misses on its pixel phase, and the area is small, so it looks at every pixel there
    const step = g0 < 1.15 ? 1 : 2;
    const spot = best(img, set, DIGITS, 0, img.w - t0.w, 0, img.h - t0.h, step), spots = [spot];
    if (spot.score < DIGIT && step === 2) {
      const r = coarseBest(img, set, DIGITS, 0, img.w - t0.w, 0, img.h - t0.h);
      if (Math.abs(r.x - spot.x) > 3 || Math.abs(r.y - spot.y) > 3) spots.push(r);
    }
    for (const p of spots) {
      if (p.score < 0.6) continue;
      const cx = img.x + p.x, cy = img.y + p.y;
      for (let s = g0 * 0.92; s <= g0 * 1.08; s += 0.0125) {
        const fine = setAt('level', s), f0 = fine['0'], near = region(src, cx - 8, cy - 8, f0.w + 16, f0.h + 16);
        const b = best(near, fine, DIGITS, 0, near.w - f0.w, 0, near.h - f0.h);
        const one = { s: atBase('level', s) ? 1 : Math.round(s * 1000) / 1000, score: b.score, x: near.x + b.x, y: near.y + b.y };
        tries.push(one);
        if (b.score > top.score) top = one;
      }
    }
    if (top.score >= 0.85) break;
  }
  // lx, ly: where a level digit was found, so readLevel looks there first instead of the whole area
  const out = { s: top.s, sc: top.s, score: Math.max(0, top.score), countScore: 0, lx: top.x, ly: top.y };
  if (out.score >= LEVEL) { const c = fineCounts(src, line, out.s); out.sc = c.sc; out.countScore = c.score; }
  // The level digits can fit two stretches almost equally (1.72 and 1.81 on Rimmah's 2560x1440, 2026-11-08), and the wrong
  // one makes the count digits miss (0.77), which drops every slot ("Put the potions you drink on your quickslots"). So when
  // the counts don't read, the next best level fits are tried and the one whose counts read wins.
  if (out.score >= LEVEL && out.countScore < COUNTS_OK) {
    const seen = [out.s], g1 = frameH / 768;
    for (const t of tries.filter(q => q.score >= top.score - 0.02).sort((p, q) => Math.abs(p.s - g1) - Math.abs(q.s - g1))) {
      if (seen.length > 4) break;
      if (seen.some(v => Math.abs(v - t.s) < 0.03)) continue;
      seen.push(t.s);
      const c = fineCounts(src, line, t.s);
      if (c.score <= out.countScore) continue;
      // a wrong stretch can still score 0.85 on the digits, but it can't place the slots a real pitch apart
      const probe = { s: t.s, sc: c.sc, countScore: c.score, grid: null };
      readCounts(src, line, probe);
      if (probe.grid && (Math.abs(probe.grid.px / (PITCH_X * c.sc) - 1) > 0.05 || Math.abs(probe.grid.py / (PITCH_Y * c.sc) - 1) > 0.05)) continue;
      Object.assign(out, { s: t.s, sc: c.sc, countScore: c.score, lx: t.x, ly: t.y, score: t.score });
      if (out.countScore >= COUNTS_OK) break;
    }
  }
  // a thin 1 matches at almost any size, so the fine tune above can settle too small and miss the digit beside it (level 51
  // read as 1). The counts are many digits and a truer measure, so when they read well the level uses their stretch too
  if (out.score >= LEVEL && out.countScore >= COUNTS_OK) out.s = out.sc;
  return out;
}
// The level box never moves, so it reads around the digit found last time (a few digits either side, ~5 ms) and only
// searches the whole area (~700 ms on a 2560x1440 share) when that spot no longer matches.
function readLevel(src, line, m) {
  const set = setAt('level', m.s), t0 = set['0'];
  if (m.lx != null) {
    const img = region(src, m.lx - 2 * t0.w - 4, m.ly - 4, 5 * t0.w + 8, t0.h + 8), r = levelIn(img, set, t0);
    if (r.ok) { m.lx = img.x + r.x; m.ly = img.y + r.y; return r; }
  }
  const a = levelArea(line, m.s), img = region(src, a.x, a.y, a.w, a.h), r = levelIn(img, set, t0);
  if (r.ok) { m.lx = img.x + r.x; m.ly = img.y + r.y; }
  return r;
}
// searched with the plain digits only (the half pixel copies would make it 4 times slower, 60 ms a tick on the near spot)
// and then looked at again with every copy around the spot it found
function levelIn(img, set, t0) {
  let first = best(img, set, DIGITS, 0, img.w - t0.w, 0, img.h - t0.h);
  if (first.score >= 0.6) first = best(img, set, LEVEL_KEYS, Math.max(0, first.x - 1), first.x + 1, Math.max(0, first.y - 1), first.y + 1);
  if (first.score < LEVEL) return { ok: false, score: first.score };
  const ds = [first];
  const r = best(img, set, LEVEL_KEYS, first.x + t0.w - 3, first.x + t0.w + 3, first.y - 1, first.y + 1);
  const l = best(img, set, LEVEL_KEYS, first.x - t0.w - 3, first.x - t0.w + 2, first.y - 1, first.y + 1);
  if (r.score >= LEVEL) ds.push(r);
  if (l.score >= LEVEL) ds.unshift(l);
  return { ok: true, level: parseInt(ds.map(q => q.d[0]).join(''), 10), score: Math.min(...ds.map(q => q.score)), x: first.x, y: first.y };
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
function sweepCounts(img, s, at) {
  const spots = roughSpots(img, setAt('count', at), 0.6).sort((p, q) => q.score - p.score).slice(0, 24);
  let top = { sc: s, score: 0, hits: [] };
  if (!spots.length) return top;
  for (let sc = s * 0.97; sc <= s * 1.08; sc += 0.0125) {
    const set = setAt('count', sc), hits = spots.map(p => best(img, set, SLOT_KEYS, p.x - 3, p.x + 3, p.y - 3, p.y + 3));
    const scores = hits.map(h => h.score).sort((p, q) => q - p).slice(0, 6);
    const mean = scores.reduce((p, q) => p + q, 0) / scores.length;
    if (mean > top.score) top = { sc: atBase('count', sc) ? 1 : Math.round(sc * 1000) / 1000, score: mean, set, hits };
  }
  return top;
}
// When that falls short, two second tries, both from kev's 1920x1080 window (2026-11-12): spots looked for a little
// above the level boxes' stretch, the middle of the sweep (his level boxes fit 1.29 and his counts 1.33 to 1.40, and an
// 8 picture at 1.29 scored 0.56 on his real 8), and a bar with fewer than 6 digits on it (his 76 and 85, a thin edge
// scoring 0.77 as a 1 all the way down) scored over the digits it has, never fewer than 2. Frames that pass the first
// sweep never get here, so they read as before (shop-full.png, at 0.799, now reads its five counts right)
const SPOT_AT = 1.03;
function fineCounts(src, line, s) {
  const a = slotArea(line, s), img = region(src, a.x, a.y, a.w, a.h);
  let top = sweepCounts(img, s, s);
  if (top.score >= COUNTS_OK) return { sc: top.sc, score: top.score };
  const up = sweepCounts(img, s, s * SPOT_AT);
  if (up.score > top.score) top = up;
  if (!top.hits.length) return { sc: top.sc, score: top.score };
  // the strong spots grow into their numbers, and the grown digits count among the spots
  const { set, hits } = top, pool = [];
  const add = h => { if (!pool.some(q => Math.abs(q.x - h.x) < 4 && Math.abs(q.y - h.y) < 4)) pool.push(h); };
  let digits = 0;
  for (const h of hits.filter(q => q.score >= DIGIT).sort((p, q) => q.score - p.score)) {
    if (pool.some(q => q.grown && Math.abs(q.x - h.x) < 4 && Math.abs(q.y - h.y) < 4)) continue;
    const n = [h];
    for (let k = 0; k < 5; k++) {
      const l = n[n.length - 1], r = best(img, set, SLOT_KEYS, l.x + l.t.w - 2, l.x + l.t.w + 2, l.y - 1, l.y + 1);
      if (r.score < NEXT) break; n.push(r);
    }
    for (let k = 0; k < 5; k++) {
      const f = n[0]; let lb = { score: -1 };
      for (const d of SLOT_KEYS) { const t = set[d], c = best(img, set, [d], f.x - t.w - 2, f.x - t.w + 2, f.y - 1, f.y + 1); if (c.score > lb.score) lb = c; }
      if (lb.score < NEXT) break; n.unshift(lb);
    }
    n.forEach(q => { q.grown = true; add(q); });
    digits += n.length;
  }
  hits.forEach(add);
  if (digits < 6) {
    const k = Math.max(2, digits), top6 = pool.map(q => q.score).sort((p, q) => q - p).slice(0, k);
    const few = top6.reduce((p, q) => p + q, 0) / top6.length;
    if (few > top.score) top.score = few;
  }
  return { sc: top.sc, score: top.score };
}
// three rows: the top one (under the chat buttons, Rimmah's 2026-11-10 setup keeps a potion in its 4th slot) sits at about -125 base
// pixels from the EXP line, the middle at -90 and the bottom at -55. Without its own row a top potion took the middle row's key
const KEYS = [['Top1', 'Top2', 'Top3', 'Top4'], ['Shift', 'Ins', 'Hm', 'Pup'], ['Ctrl', 'Del', 'End', 'Pdn']];
const keyOf = (bx, by) => { const row = KEYS[by < -107 ? 0 : by < -73 ? 1 : 2], col = Math.round((bx - 241) / 36); return row[col] || null; };
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
      const l = n[n.length - 1], r = best(img, set, SLOT_KEYS, l.x + l.t.w - 2, l.x + l.t.w + 2, l.y - 1, l.y + 1);
      if (r.score < NEXT) break; n.push(r);
    }
    for (let k = 0; k < 5; k++) {
      const f = n[0]; let lb = { score: -1 };
      for (const d of SLOT_KEYS) { const t = set[d], c = best(img, set, [d], f.x - t.w - 2, f.x - t.w + 2, f.y - 1, f.y + 1); if (c.score > lb.score) lb = c; }
      if (lb.score < NEXT) break; n.unshift(lb);
    }
    return n.some(q => q.score >= DIGIT) ? n : null;
  };
  const out = n => {
    const x = img.x + n[0].x, y = img.y + n[0].y, bx = (x - atX(line, m.s)) / m.s, by = (y - line.y) / m.s;
    return { key: keyOf(bx, by), bx, by, x, y, value: parseInt(n.map(q => q.d[0]).join(''), 10), score: Math.min(...n.map(q => q.score)) };
  };
  // the number whose first digit sits near screen pixel (ax, ay), for the slot named key, or null
  const atSpot = (key, ax, ay, padX, padY) => {
    const ex = Math.round(ax - img.x), ey = Math.round(ay - img.y);
    const x0 = Math.max(0, ex - padX), x1 = Math.min(img.w - t0.w, ex + padX), y0 = Math.max(0, ey - padY), y1 = Math.min(img.h - t0.h, ey + padY);
    if (x0 > x1 || y0 > y1) return null;
    const b = best(img, set, SLOT_KEYS, x0, x1, y0, y1);
    if (b.score < NEXT) return null;
    const n = grow(b);
    return n ? Object.assign(out(n), { key }) : null;
  };
  // Every tick after the first: the slots never move, so check just where each count starts (~10 ms instead of ~200 ms
  // for the whole area). A potion dropped into an empty slot shows up there too. Nothing at any spot means the HUD
  // moved, so it forgets the grid and searches everywhere.
  if (m.grid) {
    const found = [];
    for (let r = 0; r < KEYS.length; r++) for (let c = 0; c < KEYS[r].length; c++) {
      const n = atSpot(KEYS[r][c], m.grid.x + c * m.grid.px, m.grid.y + r * m.grid.py, 3, 2);
      if (n) found.push(n);
    }
    if (found.length) return found;
    m.grid = null;
  }
  // first pass: spots that look like an 8 or a 1, each checked 4 pixels either way for the real digit (the 8 picture best
  // fits the 4 of "477" 4 pixels to its right)
  const seeds = [];
  for (const h of roughSpots(img, set, ROUGH)) {
    const b = best(img, set, SLOT_KEYS, h.x - 4, h.x + 4, h.y - 2, h.y + 2);
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
      const n = atSpot(key, at.f.x + (c - at.c) * px, at.f.y + (r - at.r) * py, 6, 3);
      if (n) found.push(n);
    }
    // the grid as screen pixels, for the next ticks: where the count of the top left slot starts, and slot to slot
    m.grid = { x: at.f.x - at.c * px, y: at.f.y - at.r * py, px, py };
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
// A white icon (the Cake) matches the slot's own near white wherever it lies, about a third of its pixels on any slot, so
// the winner must also explain the slot: of the screen pixels under it that aren't the slot's colour, at least
// ICON_EXPLAIN must match it. Real potions explained 28% (the White Potion) to 80%; a Cake laid over a gold buff
// bottle it doesn't know (Rimmah's every resolution shots, 2026-11-13) explained 4% or less and was named Cake on 7 of 10.
const ICON_TOL = 20, ICON_SHARE = 0.33, ICON_GAP = 0.03, ICON_EXPLAIN = 0.15;
function readIcon(src, count, m) {
  const I = iconSet(), W = 52, H = 48, x0 = count.x - 10 * m.s, y0 = count.y - 34 * m.s;
  const g = ctx2d(W, H); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(src, x0, y0, W * m.s, H * m.s, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data, tol = ICON_TOL * 3;
  let top = { id: null, share: 0 }, second = 0;
  for (const [id, t] of Object.entries(I)) {
    const n = t.idx.length;
    let bestK = 0, bx = 0, by = 0;
    for (let y = 0; y + t.h <= H; y++) for (let x = 0; x + t.w <= W; x++) {
      const base = y * W + x;
      let k = 0;
      for (let j = 0; j < n; j++) {
        if (k + (n - j) <= bestK) break;   // can't beat this icon's best spot
        const i = t.idx[j], a = (base + ((i / t.w) | 0) * W + (i % t.w)) * 4, q = i * 4;
        if (Math.abs(d[a] - t.d[q]) + Math.abs(d[a + 1] - t.d[q + 1]) + Math.abs(d[a + 2] - t.d[q + 2]) < tol) k++;
      }
      if (k > bestK) { bestK = k; bx = x; by = y; }
    }
    const share = bestK / n;
    if (share > top.share) { second = top.share; top = { id, share, t, bx, by }; } else if (share > second) second = share;
  }
  const explains = top.t ? explained(d, W, top.t, top.bx, top.by, tol) : 0;
  const sure = top.share >= ICON_SHARE && top.share - second >= ICON_GAP && explains >= ICON_EXPLAIN;
  return { id: sure ? top.id : null, share: top.share, explains: +explains.toFixed(2), diff: sure ? Math.round((1 - top.share) * 100) : 100 };
}
// the share of the screen pixels under an icon's solid part that aren't the slot's colour (the commonest bright colour in
// the cell) and still match the icon; 1 when the cell has no bright colour to call the slot's
function explained(d, W, t, bx, by, tol) {
  const hist = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] < 180 || d[i + 1] < 180 || d[i + 2] < 180) continue;
    const k = (d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | d[i + 2] >> 3;
    hist.set(k, (hist.get(k) || 0) + 1);
  }
  let mk = -1, mn = 0;
  for (const [k, v] of hist) if (v > mn) { mn = v; mk = k; }
  if (mk < 0) return 1;
  const bg = [((mk >> 10) & 31) * 8 + 4, ((mk >> 5) & 31) * 8 + 4, (mk & 31) * 8 + 4];
  let n = 0, k = 0;
  for (const i of t.idx) {
    const a = ((by + ((i / t.w) | 0)) * W + bx + (i % t.w)) * 4, q = i * 4;
    if (Math.abs(d[a] - bg[0]) + Math.abs(d[a + 1] - bg[1]) + Math.abs(d[a + 2] - bg[2]) < tol) continue;
    n++;
    if (Math.abs(d[a] - t.d[q]) + Math.abs(d[a + 1] - t.d[q + 1]) + Math.abs(d[a + 2] - t.d[q + 2]) < tol) k++;
  }
  return n ? k / n : 1;
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
const partyArea = (line, s) => ({ x: atX(line, s) + 200 * s, y: line.y - 300 * s, w: 540 * s, h: 296 * s });
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
// the meso box on screen: { x, y, w, h, s } or null. lastBox is where it was last seen, kept while the inventory is
// closed (it opens at the same spot): checking there costs a few ms, searching the whole frame a quarter second
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
const atHome = src => lastBox && invGeometry() ? confirmBox(src, lastBox.x, lastBox.y + Math.round(lastBox.h / 2), lastBox.w - 1) : null;
function findMesoBox(src) {
  const c = atHome(src);   // the window seldom moves: check where it was first
  if (c) return (lastBox = c);
  const f = scanBoxes(src, b => b);
  if (f) lastBox = f;
  return f;
}
// where the inventory was last seen: mesoHome() reads it, mesoHome(box) sets it (kept from an earlier session), null forgets
function mesoHome(box) { if (arguments.length) lastBox = box || null; return lastBox; }
// every box shape on the frame, top to bottom, handed to take until it returns something
function scanBoxes(src, take) {
  const G = invGeometry(); if (!G) return null;
  const { w: W, h: H } = sizeOf(src);
  const g = ctx2d(W, H); g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, W, H).data, white = i => Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) >= 236, tried = [];
  // how many rows of white, up and down from row y, at column x
  const whiteRun = (x, y) => { let a = y, z = y; while (a > 0 && white((a - 1) * W + x)) a--; while (z < H - 1 && white((z + 1) * W + x)) z++; return z - a + 1; };
  for (let y = 2; y < H - 2; y += 2) {
    let st = -1;
    for (let x = 0; x <= W; x++) {
      const on = x < W && white(y * W + x);
      if (on && st < 0) st = x;
      if (on || st < 0) continue;
      const len = x - st, s = len / G.fw;
      // the box's field is white straight up and down at its left edge for its height (as invGeometry measures it in the
      // client's picture): a white line, text or the sky isn't, and skipping them before the label match keeps the
      // hunt light (every white streak of the width got the match: 205 ms a hunt)
      const tall = s >= 0.7 && s <= 3.4 ? whiteRun(st + Math.max(2, Math.round(2 * s)), y) : 0;
      if (tall >= 0.6 * G.fh * s && tall <= 1.4 * G.fh * s && !tried.some(q => Math.abs(q[0] - st) < 4 && Math.abs(q[1] - len) < 4 && Math.abs(q[2] - y) < 40)) {
        tried.push([st, len, y]);
        const c = confirmBox(src, st, y, len), r = c && take(c);
        if (r) return r;
      }
      st = -1;
    }
  }
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
// { ok, value, box } or { ok: false, reason }: 'no inventory', 'unsure' (a digit not clearly one), 'bad commas'.
// opts.search false: only where the inventory was last seen. A box found by searching counts only if its total reads,
// so something shaped like it (a sign beside a cloud) is never asked about
function readMesos(src, opts) {
  const home = atHome(src);
  if (home) { const r = mesoTotal(src, home); if (r.ok) lastBox = home; return r; }
  if (opts && opts.search === false) return { ok: false, reason: 'no inventory' };
  const r = scanBoxes(src, b => { const r = mesoTotal(src, b); return r.ok ? r : null; });
  if (r) { lastBox = r.box; return r; }
  return { ok: false, reason: 'no inventory' };
}
function mesoTotal(src, box) {
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
// the open tab is the pink one in the tab bar (Item.img Tab enabled, 224,96,128). After something new lands in a tab it
// blinks: Item.img New/Tab lays white over it at up to 73%, so the open one goes as pale as 236,201,210, still redder
// than it is green or blue, where the grey tabs and the white names never are
function readTab(src, win) {
  const s = win.s, img = region(src, win.x + 4 * s, win.y + 21 * s, 201 * s, 16 * s), d = img.data;
  let sum = 0, n = 0;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const k = (y * img.w + x) * 4;
    if (d[k] > 170 && d[k] - d[k + 1] > 25 && d[k] - d[k + 2] > 10) { sum += x; n++; }
  }
  if (n < 20 * s) return null;
  return TABS[Math.max(0, Math.min(5, Math.floor((sum / n / s + 4 - 5) / 33.5)))];
}
// the count digits' own stretch on this window (the stretch is measured from the box, the digits round a little smaller)
const SLOT_MORE = 0.6;
let slotSc = { s: 0, sc: 0 }, slotCache = { key: '', slots: {} };   // the item in each slot, while its count stays
function slotRect(win, r, c) { const s = win.s; return { x: win.x + (SLOT.x0 + c * SLOT.px) * s, y: win.y + (SLOT.y0 + r * SLOT.py) * s, w: SLOT.w * s, h: SLOT.h * s }; }
// the number at the bottom left of a slot, or null
// guardLeft (the bag reader): something digit like just left of the first digit means a faint leading 1 was missed
// ("12" read as "2" on a small share), so none
function slotNumber(src, rect, sc, guardLeft) {
  const set = setAt('count', sc), t0 = set['0'];
  const img = region(src, rect.x - 3, rect.y + rect.h - t0.h - 6, Math.min(rect.w, t0.w * 4) + 6, t0.h + 9);
  let first = { score: -1 };
  for (const d of SLOT_KEYS) { const b = best(img, set, [d], 0, Math.min(8, img.w - set[d].w), 0, img.h - set[d].h); if (b.score > first.score) first = b; }
  if (first.score < NEXT) return null;
  if (guardLeft) {
    const w1 = set['1'].w, x1 = first.x - w1 - 2, x2 = first.x - w1 + 1;
    if (x2 >= 0 && best(img, set, ['1', '1~'], Math.max(0, x1), x2, Math.max(0, first.y - 1), Math.min(img.h - set['1'].h, first.y + 1)).score >= SLOT_MORE) return null;
  }
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

/* ---------- the bag for Count my loot: every item in the open tab, and where the scrollbar is ---------- */

// Every Equip, Use and Etc picture in the client (data/loot-icons.*, one cell per distinct picture), per tab. Each keeps
// its solid pixels above the bottom 12 rows (where a count is drawn) and a colour histogram of them, so a slot is first
// narrowed to the few pictures with the nearest colours and only those are matched pixel by pixel.
let loot = null;
const HBINS = 64, NEAR = 32, NEAR_COLOUR = 16;
const bgLike = (r, g, b) => Math.abs(r - 229) + Math.abs(g - 231) + Math.abs(b - 219) < 40 || (r > 240 && g > 240 && b > 240);
function hist(d, list) {
  const h = new Float32Array(HBINS); let n = 0;
  for (const k of list) { if (bgLike(d[k], d[k + 1], d[k + 2])) continue; h[(d[k] >> 6) * 16 + (d[k + 1] >> 6) * 4 + (d[k + 2] >> 6)]++; n++; }
  if (n) for (let i = 0; i < HBINS; i++) h[i] /= n;
  return { h, n };
}
function loadLoot(sheet, index) {
  const g = ctx2d(sheet.width, sheet.height); g.drawImage(sheet, 0, 0);
  const all = g.getImageData(0, 0, sheet.width, sheet.height).data, W = sheet.width;
  const tabs = index.cells.map(() => new Set());
  for (const [tab, , , k] of Object.values(index.items)) tabs[k].add(tab);
  const sets = { Equip: [], Use: [], Etc: [] };
  index.cells.forEach((c, k) => {
    const x0 = (k % index.cols) * index.cell, y0 = Math.floor(k / index.cols) * index.cell, d = new Uint8ClampedArray(c.w * c.h * 4);
    for (let y = 0; y < c.h; y++) d.set(all.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + c.w) * 4), y * c.w * 4);
    const idx = [];
    for (let i = 0; i < c.w * Math.max(1, c.h - 12); i++) if (d[i * 4 + 3] > 200) idx.push(i);
    if (idx.length < 8) return;
    // every 7th solid pixel for the quick first pass over all pictures, then every pixel for the few left
    const t = { cell: k, w: c.w, h: c.h, d, idx, few: idx.filter((_, j) => j % 7 === 0), hist: hist(d, idx.map(i => i * 4)).h };
    for (const tab of tabs[k]) sets[tab].push(t);
  });
  loot = { sets };
  bagCache = { key: '', slots: {} };
}
// The scrollbar right of the slots, in the window's base pixels: the track runs down x 196 between the arrows and the
// thumb is a bar of a fixed size (~25 px) in it, so it says how far down the tab is, never how long the tab is. No thumb
// at all is a tab that fits on one page. Anything else over the track (a tooltip) leaves it unknown (null).
// The track is read 2 px in from each arrow (at a big stretch its first row lands on the arrow's edge), as runs of
// not-track pixels joined across small gaps (the thumb has highlight lines across it), specks dropped
const SCR = { x: 196, y0: 65, y1: 236, min: 16, max: 34 };
function readScroll(src, win) {
  const s = win.s, img = region(src, win.x + SCR.x * s, win.y + SCR.y0 * s, 1, (SCR.y1 - SCR.y0) * s), d = img.data, H = img.h, runs = [];
  for (let y = 0, st = -1, blue = false; y <= H; y++) {
    const k = y * 4, L = y < H ? img.L[y] : 255, on = y < H && !(L > 215 && !(d[k + 2] > 200 && L < 190));
    if (on) { if (st < 0) { st = y; blue = false; } if (d[k + 2] > 200 && L < 190) blue = true; continue; }
    if (st < 0) continue;
    const last = runs[runs.length - 1];
    if (last && (st - last.b) / s <= 2.5) { last.b = y - 1; last.blue = last.blue || blue; } else runs.push({ a: st, b: y - 1, blue });
    st = -1;
  }
  const real = runs.filter(r => (r.b - r.a + 1) / s >= 2);
  if (!real.length) return { at: 0, top: true, bottom: true, none: true };
  if (real.length > 1) return null;
  const r = real[0], len = (r.b - r.a + 1) / s;
  if (len < SCR.min || len > SCR.max) return null;   // a tooltip over the track is far longer than the thumb
  const span = (SCR.y1 - SCR.y0) - len;
  return { at: Math.max(0, Math.min(1, (r.a / s) / span)), top: r.a / s <= 2, bottom: (H - 1 - r.b) / s <= 2 };
}
// the count digits' own stretch on this window, fine tuned once per window size on the slots that have a number
function countScale(src, win, box) {
  if (Math.abs(slotSc.s - box.s) <= 0.001) return slotSc.sc;
  let bestSc = { sc: box.s * 0.975, score: -1 };
  for (let sc = box.s * 0.95; sc <= box.s * 1.01; sc += 0.0125) {
    const scores = [];
    for (let r = 0; r < 2; r++) for (let c = 0; c < SLOT.cols; c++) { const n = slotNumber(src, slotRect(win, r, c), sc); if (n) scores.push(n.score); }
    const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    if (mean > bestSc.score) bestSc = { sc, score: mean };
  }
  slotSc = { s: box.s, sc: bestSc.sc };
  return slotSc.sc;
}
// the item in a slot: the nearest pictures by colour, then the best pixel match among them. Named only when it's under
// the same bar as the potions (75) and clearly ahead of the next picture, so two look alike pictures read as unsure
const BAG_SURE = 55, BAG_GAP = 4, BAG_FLAT = 0.45;
// is anything in the slot: the share of its inside that isn't the slot's own pale fill
// cover: the pointer over the slot (pointerOn); its pixels don't count, and too little left showing is still filled
function slotFilled(src, rect, s, cover) {
  const ins = 3 * s, x0 = Math.round(rect.x + ins), y0 = Math.round(rect.y + ins), img = region(src, x0, y0, rect.w - 2 * ins, rect.h - 2 * ins), d = img.data;
  let n = 0, seen = 0;
  for (let i = 0; i < img.w * img.h; i++) {
    if (cover && cover.has(x0 + (i % img.w), y0 + ((i / img.w) | 0))) continue;
    seen++;
    if (!bgLike(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])) n++;
  }
  return seen < 0.3 * img.w * img.h || n / seen > 0.06;
}
// The mouse pointer over a slot: the client's own pointer pictures (Basic.img Cursor, the open hand over a slot)
// stretched by s and matched by colour wherever they'd overlap the slot. { has(x, y) } for the frame pixels it covers
// (a 2 px margin for the video's smear), or null when no pointer is there
const POINTER_SURE = 35;
let pointerPics = { s: 0, list: [] };
function pointerOn(src, rect, s) {
  if (pointerPics.s !== s) {
    pointerPics = { s, list: Object.values(raw.cursor || {}).map(im => {
      const w = Math.round(im.width * s), h = Math.round(im.height * s), g = ctx2d(w, h);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h).data, few = [], cover = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) if (d[i * 4 + 3] > 200 && i % 3 === 0) few.push(i);
      for (let i = 0; i < w * h; i++) if (d[i * 4 + 3] > 0) cover[i] = 1;
      return { w, h, d, few, cover };
    }) };
  }
  let best = null;
  for (const t of pointerPics.list) {
    const ax = Math.round(rect.x - t.w), ay = Math.round(rect.y - t.h), img = region(src, ax, ay, rect.w + 2 * t.w, rect.h + 2 * t.h), D = img.data;
    for (let y = 1; y + t.h < img.h; y += 2) for (let x = 1; x + t.w < img.w; x += 2) {
      const cap = (best ? best.diff : POINTER_SURE) * t.few.length * 3;
      let sum = 0, j = 0;
      for (; j < t.few.length && sum <= cap; j++) { const i = t.few[j], k = ((y + ((i / t.w) | 0)) * img.w + x + (i % t.w)) * 4, q = i * 4; sum += Math.abs(D[k] - t.d[q]) + Math.abs(D[k + 1] - t.d[q + 1]) + Math.abs(D[k + 2] - t.d[q + 2]); }
      if (j === t.few.length && sum <= cap) best = { diff: sum / (t.few.length * 3), x: ax + x, y: ay + y, t };
    }
  }
  if (!best) return null;
  const { x: px, y: py, t } = best, M = 2;
  return { diff: best.diff, has: (x, y) => {
    for (let dy = -M; dy <= M; dy++) for (let dx = -M; dx <= M; dx++) {
      const u = x - px + dx, v = y - py + dy;
      if (u >= 0 && v >= 0 && u < t.w && v < t.h && t.cover[v * t.w + u]) return true;
    }
    return false;
  } };
}
const lumStd = (d, list) => { let a = 0, b = 0; for (const k of list) { const L = lumAt(d, k); a += L; b += L * L; } const m = a / list.length; return Math.sqrt(Math.max(0, b / list.length - m * m)); };
function bagIcon(src, rect, s, set) {
  const W = 37, H = 37, g = ctx2d(W, H); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(src, rect.x - 3 * s, rect.y - 3 * s, W * s, H * s, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data, top = [];
  for (let y = 0; y < H - 12; y++) for (let x = 0; x < W; x++) top.push((y * W + x) * 4);
  const hs = hist(d, top);
  // first pass: every picture of the tab on a sample of its pixels and a 2 px grid of spots; the best NEAR go on to the
  // full match (a colour histogram shortlist dropped the right picture for some equips and named a wrong one instead)
  const near = set.map(t => {
    let b = 1e9;
    for (let y = 0; y + t.h <= H; y += 2) for (let x = 0; x + t.w <= W; x += 2) {
      const base = y * W + x; let sum = 0;
      for (const i of t.few) { const k = (base + ((i / t.w) | 0) * W + (i % t.w)) * 4, q = i * 4; sum += Math.abs(d[k] - t.d[q]) + Math.abs(d[k + 1] - t.d[q + 1]) + Math.abs(d[k + 2] - t.d[q + 2]); }
      if (sum < b) b = sum;
    }
    return [b / (t.few.length * 3), t];
  }).sort((a, b) => a[0] - b[0]).slice(0, NEAR);
  // plus the nearest by colour, which catches a finely striped picture (a fence) the 2 px grid can miss
  for (const [, t] of set.map(t => { let e = 0; for (let i = 0; i < HBINS; i++) e += Math.abs(t.hist[i] - hs.h[i]); return [e, t]; }).sort((a, b) => a[0] - b[0]).slice(0, NEAR_COLOUR))
    if (!near.some(x => x[1] === t)) near.push([0, t]);
  let first = { t: null, diff: 1e9 }, second = 1e9;
  for (const [, t] of near) {
    let bestT = 1e9, at = 0;
    for (let y = 0; y + t.h <= H; y++) for (let x = 0; x + t.w <= W; x++) {
      const n = t.idx.length, base = y * W + x, cap = bestT * n * 3;
      let sum = 0, j = 0;
      for (; j < n && sum <= cap; j++) {
        const i = t.idx[j], k = (base + ((i / t.w) | 0) * W + (i % t.w)) * 4, q = i * 4;
        sum += Math.abs(d[k] - t.d[q]) + Math.abs(d[k + 1] - t.d[q + 1]) + Math.abs(d[k + 2] - t.d[q + 2]);
      }
      if (j === n && sum / (n * 3) < bestT) { bestT = sum / (n * 3); at = base; }
    }
    if (bestT < first.diff) { second = first.diff; first = { t, diff: bestT, at }; } else if (bestT < second) second = bestT;
  }
  let sure = first.t && first.diff < BAG_SURE && second - first.diff >= BAG_GAP, why = !first.t || first.diff >= BAG_SURE ? 'none' : sure ? 'sure' : 'close';
  // a flat patch (a tooltip's dark fill) can sit close to a dark picture's colours: the screen under the picture must
  // have some of the picture's own light and shade
  if (sure) {
    const t = first.t, scr = t.idx.map(i => (first.at + ((i / t.w) | 0) * W + (i % t.w)) * 4);
    if (lumStd(d, scr) < BAG_FLAT * lumStd(t.d, t.idx.map(i => i * 4))) { sure = false; why = 'flat'; }
  }
  return { cell: sure ? first.t.cell : null, diff: Math.round(first.diff), hist: hs.h, why };
}
let bagCache = { key: '', slots: {} };   // each slot's pixels and answer while the bag sits still
// a slot and its margin cut from the grid picture, as whole luminance
function pixelsOf(grid, rect, m) {
  const x0 = Math.max(0, Math.round(rect.x - m) - grid.x), y0 = Math.max(0, Math.round(rect.y - m) - grid.y);
  const w = Math.min(grid.w - x0, Math.round(rect.w + 2 * m)), h = Math.min(grid.h - y0, Math.round(rect.h + 2 * m)), f = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) f[y * w + x] = grid.L[(y0 + y) * grid.w + x0 + x];
  return f;
}
// the same pixels, give or take a video's noise: a count going 46 to 47, the pointer or a tooltip moves dozens by far more
function samePixels(a, b) {
  if (!a || a.length !== b.length) return false;
  for (let i = 0, n = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 40 && ++n > 6) return false;
  return true;
}
const histNear = (a, b) => { let e = 0; for (let i = 0; i < HBINS; i++) e += Math.abs(a[i] - b[i]); return e < 0.12; };
// { ok, tab, box, scroll: { at, top, bottom } | null, slots: [{ r, c, value, cell, diff, rect }] } or { ok: false, reason }.
// r and c are the slot on the page as shown; how far down the tab that page is comes from scroll (the engine lines pages
// up by their overlap). Equip slots carry a 1 in this client, so every counted tab reads the same way
function readBag(src) {
  const box = findMesoBox(src);
  if (!box) return { ok: false, reason: 'no inventory' };
  if (!loot) return { ok: false, reason: 'no loot pictures', box };
  const win = windowOf(box), tab = readTab(src, win);
  if (!tab) return { ok: false, reason: 'no tab', box };
  const scroll = readScroll(src, win);
  if (!loot.sets[tab]) return { ok: true, tab, box, scroll, slots: [] };   // Set-up, Cash, Deco: not counted
  // the cache holds while the bag sits still: the same tab, spot and scroll position (a scroll moves other items into a
  // slot, and every equip and scroll shows a 1)
  const sc = countScale(src, win, box), set = loot.sets[tab], slots = [];
  const key = tab + Math.round(box.x) + ',' + Math.round(box.y) + '@' + (scroll ? Math.round(scroll.at * 100) : '-');
  if (bagCache.key !== key) bagCache = { key, slots: {} };
  // the slot grid as one picture, with the margin the count reader and the item match look into around each slot: a slot
  // whose pixels are as they were at the last look reuses its whole answer (the bag is read twice a second while open,
  // and re-reading all 30 counts each time was most of the work)
  const m = Math.ceil(3 * win.s) + 3, g0 = slotRect(win, 0, 0), g1 = slotRect(win, SLOT.rows - 1, SLOT.cols - 1);
  const grid = region(src, g0.x - m, g0.y - m, g1.x + g1.w - g0.x + 2 * m, g1.y + g1.h - g0.y + 2 * m);
  for (let r = 0; r < SLOT.rows; r++) for (let c = 0; c < SLOT.cols; c++) {
    const rect = slotRect(win, r, c), rc = r + ',' + c, fp = pixelsOf(grid, rect, m), prev = bagCache.slots[rc];
    if (prev && samePixels(prev.fp, fp)) { if (prev.out) slots.push(Object.assign({}, prev.out, { kept: true })); continue; }
    const n = slotNumber(src, rect, sc, true);
    const box4 = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) };
    // something there without a count it can read (covered, or too small to trust): unsure, so its row waits. Under the
    // pointer, only what it leaves showing says whether anything's there
    if (!n) {
      let out = null;
      if (slotFilled(src, rect, box.s)) { const pt = pointerOn(src, rect, box.s); if (!pt || slotFilled(src, rect, box.s, pt)) out = { r, c, value: null, cell: null, diff: null, rect: box4 }; }
      if (out) slots.push(out);
      bagCache.slots[rc] = { fp, out, ic: null };
      continue;
    }
    const kept = prev && prev.ic;
    let ic = null;
    if (kept && kept.value === n.value) {
      // the same count: still the same item only if its colours didn't change (a scroll can bring another stack of 1)
      const fresh = bagIcon(src, rect, box.s, []);
      if (histNear(fresh.hist, kept.hist)) ic = kept;
    }
    if (!ic) { ic = bagIcon(src, rect, box.s, set); ic.value = n.value; }
    const out = { r, c, value: n.value, cell: ic.cell, diff: ic.diff, rect: box4, unknown: ic.cell == null && ic.why !== 'flat' };
    bagCache.slots[rc] = { fp, out, ic };
    slots.push(Object.assign({}, out, { kept: ic === kept }));
  }
  return { ok: true, tab, box, scroll, slots };
}

/* ---------- the NPC shop window: your meso total while you buy and sell ---------- */

// The shop window (ShopBg, 465 x 379 base) has a red divider across each of its two panels at base y 117, x 4 to 230
// and 234 to 460: two red runs of the same length side by side on one row are the shop, and their length gives the
// stretch. The meso box is drawn over the window, not part of its picture: a white field at base (365, 65) about
// 91 x 14 (measured on Rimmah's two shop crops, which agree to the pixel). Digits are read like the inventory's.
const SHOP = { red: 227, gap: 230, lx: 4, ly: 117, bx: 365, by: 65.4, bw: 91, bh: 13.6 };
let lastShop = null;
const isRed = (d, k) => d[k] > 150 && d[k + 1] < 70 && d[k + 2] < 70;
// red runs on a row of RGBA, small breaks (the tab buttons' edges) bridged: [[start, end]]
function redRuns(d, y, W, x0, x1) {
  const runs = []; let st = -1, last = -1;
  for (let x = x0; x < x1; x++) {
    if (!isRed(d, (y * W + x) * 4)) continue;
    if (st >= 0 && x - last <= 6) { last = x; continue; }
    if (st >= 0) runs.push([st, last]);
    st = x; last = x;
  }
  if (st >= 0) runs.push([st, last]);
  return runs;
}
// the white meso box near where the window says it is: { x, y, w, h, s } or null
function shopBox(src, x0, y0, s) {
  const ex = x0 + SHOP.bx * s, ey = y0 + SHOP.by * s, img = region(src, ex - 8, ey - 6, SHOP.bw * s + 16, SHOP.bh * s + 12), d = img.data, W = img.w;
  const white = (x, y) => { const k = (y * W + x) * 4; return Math.min(d[k], d[k + 1], d[k + 2]) >= 236; };
  // two rows 1.5 base px inside the box's top and bottom edges (the digits sit between them)
  const midY = Math.round(img.h / 2), yA = Math.round(6 + 1.5 * s), yB = Math.round(6 + (SHOP.bh - 1.5) * s);
  let a = -1;
  for (let x = 0; x < 20 && x < W; x++) if (white(x, yA) && white(x, yB)) { a = x; break; }
  if (a < 0) return null;
  let b = a; while (b + 1 < W && white(b + 1, yA)) b++;
  if (Math.abs((b - a + 1) / s - SHOP.bw) > 8) return null;
  let top = yA, bot = top;
  while (top > 0 && white(a + 2, top - 1)) top--;
  while (bot + 1 < img.h && white(a + 2, bot + 1)) bot++;
  if (Math.abs((bot - top + 1) / s - SHOP.bh) > 4 || midY < top || midY > bot) return null;
  return { x: img.x + a, y: img.y + top, w: b - a + 1, h: bot - top + 1, s };
}
// the shop window's anchor on screen { x0, y0, s }, by its two red dividers, or null
function findShop(src) {
  const { w: W, h: H } = sizeOf(src), g = ctx2d(W, H); g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;
  for (let y = 0; y < H; y += 2) {
    const runs = redRuns(d, y, W, 0, W);
    for (const [a, b] of runs) {
      const L = b - a + 1, s = L / SHOP.red;
      if (s < 0.7 || s > 3.4) continue;
      const pair = runs.find(([c, e]) => Math.abs(c - (a + SHOP.gap * s)) <= 6 * s + 4 && Math.abs((e - c + 1) - L) <= 0.06 * L);
      if (!pair) continue;
      let top = y; while (top > 0 && isRed(d, ((top - 1) * W + a + 2) * 4)) top--;
      return { x0: a - SHOP.lx * s, y0: top - SHOP.ly * s, s };
    }
  }
  return null;
}
// where the shop was last seen: shopHome() reads it, shopHome(x) sets it, null forgets
function shopHome(x) { if (arguments.length) lastShop = x || null; return lastShop; }
// { ok, value, box } or { ok: false, reason }: 'no shop', 'unsure', 'bad commas'. opts.search false: only where it was
// last seen (a red divider still there and a box to read), so a closed shop costs a few ms a tick
function readShop(src, opts) {
  const at = lastShop;
  if (at) {
    const k = region(src, at.x0 + (SHOP.lx + 20) * at.s, at.y0 + SHOP.ly * at.s, 6, Math.max(2, 2 * at.s));
    const there = isRed(k.data, 0) || isRed(k.data, (k.w * k.h - 1) * 4);
    const box = there ? shopBox(src, at.x0, at.y0, at.s) : null;
    if (box) { const r = mesoTotal(src, box); return r.ok ? r : { ok: false, reason: r.reason, box }; }
  }
  if (opts && opts.search === false) return { ok: false, reason: 'no shop' };
  const w = findShop(src), box = w && shopBox(src, w.x0, w.y0, w.s);
  if (!box) return { ok: false, reason: 'no shop' };
  const r = mesoTotal(src, box);
  if (r.ok) lastShop = w;
  return r.ok ? r : { ok: false, reason: r.reason, box };
}

/* ---------- which map: the minimap window ---------- */

// The minimap window sits at the top left with its picture's top at y 72, centred across a window as wide as the picture or
// the map's name, so only x is unknown. It's drawn at the frame's height / 768, or / 720 on the Ideal UI Size (the level boxes'
// measured stretch doesn't hold for it: 1.81 to 1.96 on frames where the window is at 1.875). The pictures (data/minimaps, half
// size) are art on a see-through ground with dots drawn over them, so only solid pixels are scored, in colour: in brightness
// alone a small picture fits inside most bigger ones. Real pictures score 0.79 (a window over part of it) to 0.97, frames with
// no picture 0.56 at most. All numbers here are half size pixels.
const MAP_W = 230, MAP_H = 300, MAP_TOP = 36, MAP_WIDEST = 150;   // the area read, the picture's top, the widest window
const MAP_SURE = 0.72, MAP_GOOD = 0.9, MAP_LEAD = 0.1, MAP_KEEP = 6, MAP_SPLIT = 1.5, MAP_SPLIT_PX = 20;
let maps = null, mapSpot = null;
function loadMaps(sheet, index) {
  const g = ctx2d(sheet.width, sheet.height); g.drawImage(sheet, 0, 0);
  maps = Object.entries(index).map(([id, [x, y, w, h]]) => {
    const d = g.getImageData(x, y, w, h).data, solid = [], few = [];
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const k = (r * w + c) * 4;
      if (d[k + 3] > 200) { solid.push(k); if (r % 3 === 0 && c % 3 === 0) few.push(k); }
    }
    return { id: +id, w, h, d, solid, few };
  }).filter(t => t.few.length >= 30);
  mapSpot = null;
}
function mapArea(src, s, x0 = 0, y0 = 0) {
  const g = ctx2d(MAP_W, MAP_H); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(src, x0, y0, MAP_W * 2 * s, MAP_H * 2 * s, 0, 0, MAP_W, MAP_H);
  const f = g.getImageData(0, 0, MAP_W, MAP_H).data;
  f.skip = mapDots(f);
  return f;
}
// The dots on a minimap (players red, party yellow, you a blue bullseye, each 10 to 12 px in a grey ring) aren't in the
// picture, and five of them took a real picture from 0.85 to 0.68 (Rimmah's 1024 x 768 shots, 2026-11-13). A dot's middle is
// a small blob of strong red, yellow or cyan; it and the ring round it are left out of the score. Big blobs (a blue sky) stay.
const DOT_MAX = 16, DOT_R = 3;
function mapDots(f) {
  const n = MAP_W * MAP_H, hot = new Uint8Array(n), skip = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = f[i * 4], g = f[i * 4 + 1], b = f[i * 4 + 2], hi = Math.max(r, g, b), lo = Math.min(r, g, b);
    if (hi - lo < 90) continue;
    if ((r === hi && g < r * 0.4 && b < r * 0.4) || (b < Math.min(r, g) * 0.5 && r > 150 && g > 130) || (r < Math.min(g, b) * 0.6 && b > 140)) hot[i] = 1;
  }
  const stack = [], blob = [];
  let any = false;
  for (let i = 0; i < n; i++) {
    if (hot[i] !== 1) continue;
    blob.length = 0; stack.push(i); hot[i] = 2;
    while (stack.length) {
      const j = stack.pop(), x = j % MAP_W; blob.push(j);
      for (const k of [x > 0 ? j - 1 : -1, x < MAP_W - 1 ? j + 1 : -1, j - MAP_W, j + MAP_W]) if (k >= 0 && k < n && hot[k] === 1) { hot[k] = 2; stack.push(k); }
    }
    if (blob.length > DOT_MAX) continue;
    any = true;
    for (const j of blob) {
      const x = j % MAP_W, y = (j / MAP_W) | 0;
      for (let dy = -DOT_R; dy <= DOT_R; dy++) for (let dx = -DOT_R; dx <= DOT_R; dx++) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < MAP_W && Y < MAP_H) skip[Y * MAP_W + X] = 1;
      }
    }
  }
  return any ? skip : null;
}
// Where the game's picture sits in a share, { x, y, w, h }: inside black bars (Full Screen at 4:3 or 16:10 on a 16:9 monitor
// draws bars beside it) and under a window's title bar (a window share carries the title bar and a 1 px border, 28 to 37 rows
// on the shares seen). The game is 16:9, 16:10, 4:3 or 5:4 wide and stands on its status bar, the lowest lit row, so the game's
// top is its height above that, and a window's title bar is whatever is left over (5 to 80 rows). The top lit row only says
// where a title bar starts: a dark scene can leave the game's own top rows black. A whole screen with a window on it fits none
// of these: null, and the minimap is looked for at the share's corner (Rimmah's shots of every resolution, 2026-11-13: every
// window and the 4:3 and 16:10 Full Screens missed their minimap)
const ASPECTS = [9 / 16, 10 / 16, 3 / 4, 4 / 5];
function gameRect(src) {
  const { w: W, h: H } = sizeOf(src), g = ctx2d(W, H); g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, W, H).data, lit = i => Math.max(d[i], d[i + 1], d[i + 2]) > 24;
  const colLit = x => { for (let y = 0; y < H; y += 3) if (lit((y * W + x) * 4)) return true; return false; };
  const rowLit = y => { for (let x = 0; x < W; x += 3) if (lit((y * W + x) * 4)) return true; return false; };
  let L = 0, R = W - 1, T = 0, B = H - 1;
  while (L < R && !colLit(L)) L++;
  while (R > L && !colLit(R)) R--;
  while (T < B && !rowLit(T)) T++;
  while (B > T && !rowLit(B)) B--;
  const fw = R - L + 1;
  if (fw < 300 || B - T < 200) return null;
  let fit = null;
  for (const b of [0, 1]) for (const a of ASPECTS) {
    const cw = fw - 2 * b, ch = Math.round(cw * a), y = B + 1 - b - ch, over = y - T;
    if (y < -4 || over > 80) continue;
    // a window share has a 1 px border round the game, Full Screen has none
    const win = over > 4, r = { x: L + b, y: Math.max(0, y), w: cw, h: Math.min(ch, H), rank: win ? over + (b ? 0 : 100) : (b ? 100 : 0) };
    if (!fit || r.rank < fit.rank) fit = r;
  }
  if (fit) delete fit.rank;
  return fit;
}
function mapScore(f, t, list, ox, oy) {
  if (ox < 0 || oy < 0 || ox + t.w > MAP_W || oy + t.h > MAP_H) return -1;
  let n = 0, a = 0, b = 0, aa = 0, bb = 0, ab = 0, g = 0, gg = 0;
  const skip = f.skip;
  for (const k of list) {
    const i = k >> 2, r = (i / t.w) | 0, at = ((r + oy) * MAP_W + i - r * t.w + ox) * 4;
    if (skip && skip[at >> 2]) continue;
    for (let c = 0; c < 3; c++) { const A = t.d[k + c], B = f[at + c]; a += A; b += B; aa += A * A; bb += B * B; ab += A * B; }
    n += 3; g += f[at + 1]; gg += f[at + 1] * f[at + 1];
  }
  // a flat box (a window over the picture, a black screen) has only the gaps between its channels to correlate with: not a match
  const m = n / 3;
  if (m < list.length / 2 || gg / m - (g / m) * (g / m) < 40) return 0;
  const den = (n * aa - a * a) * (n * bb - b * b);
  return den > 0 ? (n * ab - a * b) / Math.sqrt(den) : 0;
}
// every picture across the row where it could sit, on a ninth of its pixels; the best few again on all of them
function searchMaps(f) {
  return maps.map(t => {
    let v = -1, x = 0;
    for (let ox = 0, end = Math.max(4, (MAP_WIDEST - t.w) >> 1); ox <= end; ox++) { const u = mapScore(f, t, t.few, ox, MAP_TOP); if (u > v) { v = u; x = ox; } }
    return { t, v, x };
  }).sort((a, b) => b.v - a.v).slice(0, MAP_KEEP).map(q => {
    let v = -1, x = q.x, y = MAP_TOP;
    for (let oy = MAP_TOP - 1; oy <= MAP_TOP + 1; oy++) for (let ox = q.x - 2; ox <= q.x + 2; ox++) { const u = mapScore(f, q.t, q.t.solid, ox, oy); if (u > v) { v = u; x = ox; y = oy; } }
    return { t: q.t, v, x, y };
  }).sort((a, b) => b.v - a.v);
}
// two pictures this alike (Line 1 Area 3 and Area 4 differ in 9% of their pixels) are told apart on only those pixels.
// 1: it's a, -1: it's b, 0: can't tell (the same picture, or too close to call)
function splitMaps(f, a, b) {
  const A = a.t, B = b.t;
  let ea = 0, eb = 0, n = 0;
  for (const k of A.solid) {
    if (B.d[k + 3] <= 200 || Math.abs(A.d[k] - B.d[k]) + Math.abs(A.d[k + 1] - B.d[k + 1]) + Math.abs(A.d[k + 2] - B.d[k + 2]) <= 30) continue;
    const i = k >> 2, r = (i / A.w) | 0, at = ((r + a.y) * MAP_W + i - r * A.w + a.x) * 4;
    if (f.skip && f.skip[at >> 2]) continue;
    for (let c = 0; c < 3; c++) { ea += Math.abs(f[at + c] - A.d[k + c]); eb += Math.abs(f[at + c] - B.d[k + c]); }
    n++;
  }
  if (n < MAP_SPLIT_PX) return 0;
  return ea * MAP_SPLIT < eb ? 1 : eb * MAP_SPLIT < ea ? -1 : 0;
}
// a picture and its near twins at its spot: which it is, and any it can't be told from
function settleMap(f, a, twins) {
  let top = a; const also = [];
  for (const t of twins) {
    const b = { t, x: a.x, y: a.y }, w = splitMaps(f, top, b);
    if (w < 0) top = b; else if (!w) also.push(t.id);
  }
  return { top, also };
}
// { ok, id, score, also: maps it can't be told from }. Where it last was first, near twins included, since walking from one
// into the other still scores high at the same spot (a few ms). opts.search false: stop there
function readMap(src, frameH, opts) {
  if (!maps) return { ok: false, reason: 'no pictures' };
  const W = sizeOf(src).w;
  if (mapSpot && mapSpot.h === frameH && mapSpot.w === W) {
    const f = mapArea(src, mapSpot.s, mapSpot.x0, mapSpot.y0), { top, also } = settleMap(f, mapSpot, mapSpot.near), v = mapScore(f, top.t, top.t.solid, top.x, top.y);
    if (v >= MAP_SURE) {
      if (top.t !== mapSpot.t) { mapSpot.near = mapSpot.near.filter(t => t !== top.t).concat(mapSpot.t); mapSpot.t = top.t; }
      return { ok: true, id: top.t.id, score: v, also };
    }
  }
  if (opts && opts.search === false) return { ok: false, reason: 'not there' };
  mapSpot = null;
  // the game is drawn from 1366 x 768 (or 1229 x 768 at 16:10, 1024 x 768 at 4:3), from 1280 x 720 on the Ideal UI Size and
  // at 1280 x 720, and from 800 x 600, each stretched to the game's height
  const g = gameRect(src) || { x: 0, y: 0, w: W, h: frameH }, tall = g.w / g.h < 1.4;
  let at = null;
  for (const s of [g.h / 768, g.h / 720].concat(tall ? [g.h / 600] : [])) {
    const f = mapArea(src, s, g.x, g.y), rows = searchMaps(f);
    if (!at || rows[0].v > at.rows[0].v) at = { s, f, rows };
    if (at.rows[0].v >= MAP_GOOD) break;
  }
  const a = at.rows[0], near = at.rows.slice(1).filter(c => a.v - c.v < MAP_LEAD);
  if (a.v < MAP_SURE) return { ok: false, reason: 'no match', score: a.v };
  if (near.some(c => c.t.w !== a.t.w || c.t.h !== a.t.h)) return { ok: false, reason: 'unsure', score: a.v };
  const twins = near.map(c => c.t), { top, also } = settleMap(at.f, a, twins);
  mapSpot = { t: top.t, x: a.x, y: a.y, s: at.s, x0: g.x, y0: g.y, w: W, h: frameH, near: twins.filter(t => t !== top.t).concat(top.t === a.t ? [] : [a.t]) };
  return { ok: true, id: top.t.id, score: a.v, also };
}
function mapHome(spot) { if (arguments.length) mapSpot = spot || null; return mapSpot; }

window.MapleScreen = { loadMaps, readMap, mapHome, load, sizeOf, findExpLine, greenProbe, readExp, expGlyphs, measure, readLevel, readCounts, readIcon, readParty, levelArea, slotArea, partyArea,
  findMesoBox, mesoHome, mesoGlyphs, readMesos, invGeometry, readInventory, loadLoot, readBag, readScroll, readShop, shopHome };
})();

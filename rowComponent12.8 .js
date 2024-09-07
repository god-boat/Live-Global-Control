//refactored mouse handling, sliders edited in free mode reset, repeat sliders dont respond to lock, cant add mod step to steps with note on, doesnt add dummy note (new updateclipnotefunc to try and fix, see latest claude msg)
autowatch = 1;
inlets = 4;
outlets = 4;

mgraphics.init();
mgraphics.autofill = 0;
mgraphics.relative_coords = 0;

include("abletonColors.js");
var abletonColors = abletonColorsPalette;

var live_api = new LiveAPI();
var live_object = null;

var isLiveAPIConnected = false;
var width, height, cellWidth, groupSpacing, rowSpacing;
var steps = 16;
var beatDivision = 0.25; // Default to 16th notes (1/4 of a beat)
var maxSteps = 64; // Maximum number of steps allowed
var rows = [
    { notes: [], velocity: [], repeat: [], modulation: [], modActive: [], length: 16, playbackMode: 'forward', currentStep: 0, output_note: 45 },
    { notes: [], velocity: [], repeat: [], modulation: [], modActive: [], length: 16, playbackMode: 'forward', currentStep: 0, output_note: 44 },
    { notes: [], velocity: [], repeat: [], modulation: [], modActive: [], length: 16, playbackMode: 'forward', currentStep: 0, output_note: 43 },
    { notes: [], velocity: [], repeat: [], modulation: [], modActive: [], length: 16, playbackMode: 'forward', currentStep: 0, output_note: 42 },
    { notes: [], velocity: [], repeat: [], modulation: [], modActive: [], length: 16, playbackMode: 'forward', currentStep: 0, output_note: 41 }
];
var rowSpacing = 5;

var currentStep = 0;
var isPlaying = false;
var layers = {
    noteOn: [],
    velocity: []
};
var output_note = 36; // Initialize with bottom C
var currentLayer = 'noteOn'; // Default layer

var lcdcolor = [0.94902, 0.580392, 0.133333, 1];
var playheadcolor = [1, 0.5, 0, 0.5];
var hovercolor = [1, 1, 1, 0.2];
var focuscolor = [1, 1, 1, 0.4];
var clipColor = [1, 0.5, 0, 0.5]; // Default color
var abletonColors = [
];

var hover_step = -1;
var focused_step = -1;
var focused_row = -1;
var is_dragging = false;
var is_note_dragging = false;
var is_adding_notes = false;
var focus_lock_enabled = true;
var drag_start_step = -1;

var initial_click_x = 0;
var initial_click_y = 0;
var initial_slider_value = 0;

var is_mouse_down = false;
var has_dragged = false;
var mouse_start_x = 0;
var mouse_start_y = 0;

var selected_track = null;
var selected_clip = null;
var live_set_observer = null;
var selected_track_observer = null;
var selected_clip_observer = null;

initializeAbletonColors();

function initializeLayers() {
    for (var rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        var currentRow = rows[rowIndex];

        // Initialize arrays for each property
        currentRow.notes = [];
        currentRow.velocity = [];
        // currentRow.repeat = [];
        currentRow.modulation = [];
        currentRow.modActive = [];

        // Populate arrays for each step in the row
        for (var stepIndex = 0; stepIndex < currentRow.length; stepIndex++) {
            currentRow.notes.push(false);       // Initialize note as off
            currentRow.velocity.push(100);      // Initialize velocity to 100
            currentRow.repeat.push(1);          // Initialize repeat to 1
            currentRow.modulation.push(64);     // Initialize modulation to middle value
            currentRow.modActive.push(false);   // Initialize modActive to false
        }
    }
    // post("layers inititalized\n");  
}

function initializeAbletonColors() {
    include("abletonColors.js");
    if (typeof abletonColorsPalette !== 'undefined') {
        abletonColors = abletonColorsPalette;
        // post("abletonColors initialized from external file. Keys: " + Object.keys(abletonColors).join(', ') + "\n");
    } else {
        // post("Error: abletonColorsPalette not found in external file\n");
        abletonColors = {}; // Initialize to empty object to prevent errors
    }
}

function checkLiveAPIConnection() {
    try {
        if (live_api === null) {
            live_api = new LiveAPI();
        }
        live_api.path = "live_set";
        var trackCount = live_api.get("tracks").length;
        isLiveAPIConnected = true;
        return true;
    } catch (error) {
        post("Error in checkLiveAPIConnection: " + error.message + "\n");
        live_api = null;
        isLiveAPIConnected = false;
        return false;
    }
}

function safeLiveAPICall(path, property) {
    try {
        if (!live_api) {
            live_api = new LiveAPI();
        }
        if (typeof path === 'function') {
            return path();
        } else {
            live_api.path = path;
            var result = live_api.get(property);
            if (result === "get: no valid object set") {
                post("Warning: Invalid LiveAPI object for path: " + path + ", property: " + property + "\n");
                return null;
            }
            return result;
        }
    } catch (error) {
        post("Error in safeLiveAPICall: " + error.message + "\n");
        handleDisconnection();
        return null;
    }
}

function initializeScript() {
    output_note = 36;
    updateDimensions();
    steps = Math.max(1, Math.floor(steps));
    initializeLayers();
    clearSliders();

    var initTask = new Task(function () {
        try {
            if (checkLiveAPIConnection()) {
                setupObservers();
            } else {
                var retryTask = new Task(delayedInitLiveAPI, this);
                retryTask.schedule(1000);
            }
        } catch (error) {
            post("Error in initializeScript delayed task: " + error.message + "\n");
        }
    }, this);
    initTask.schedule(1000);
}

function delayedInitLiveAPI() {
    if (checkLiveAPIConnection()) {
        setupObservers();
        updateClipObserver();
    }
}

function handleDisconnection() {
    isLiveAPIConnected = false;
    selected_clip_observer = null;
    selected_track = null;
    live_set = null;
    initializeLayers();
    mgraphics.redraw();
}

function setupObservers() {
    try {
        live_set_observer = new LiveAPI(live_set_changed);
        live_set_observer.path = "live_set";
        live_set_observer.property = "view";

        selected_track_observer = new LiveAPI(track_changed);
        selected_track_observer.path = "this_device canonical_parent";
        selected_track_observer.property = "playing_slot_index";

        if (!selected_clip_observer) {
            selected_clip_observer = new LiveAPI(clipObserverCallback);
        }
        selected_clip_observer.path = "live_set view selected_track clip_slots 0 clip";
        selected_clip_observer.property = "notes";
        selected_clip_observer.property = "loop_start";
        selected_clip_observer.property = "loop_end";

        updateClipObserver();
    } catch (error) {
        post("Error in setupObservers: " + error.message + "\n");
    }
}

function clipObserverCallback(args) {
    if (args[0] === "notes" || args[0] === "loop_start" || args[0] === "loop_end") {
        if (selected_clip_observer && selected_clip_observer.id !== 0) {
            updateSequencerOnClipLoopChange();
        }
    }
}

function live_set_changed() {
    updateClipObserver();
}

function updateClipObserver() {
    try {
        if (!selected_clip_observer) {
            selected_clip_observer = new LiveAPI(clipObserverCallback);
        }

        var track = new LiveAPI("this_device canonical_parent");
        var playingSlotIndex = track.get("playing_slot_index");

        if (playingSlotIndex !== undefined && playingSlotIndex >= 0 && playingSlotIndex < 1000) {
            selected_clip_observer.path = "this_device canonical_parent clip_slots " + Math.floor(playingSlotIndex) + " clip";
            selected_clip_observer.property = "notes";
            loadClipData();
        } else {
            if (selected_clip_observer) {
                selected_clip_observer.property = "";
            }
            initializeLayers();
            mgraphics.redraw();
        }
    } catch (error) {
        post("Error in updateClipObserver: " + error.message + "\n");
        initializeLayers();
        mgraphics.redraw();
    }
}

function clearSliders() {
    if (layers && Array.isArray(layers.noteOn) && Array.isArray(layers.velocity)) {
        for (var r = 0; r < rows.length; r++) {
            for (var i = 0; i < steps; i++) {
                layers.noteOn[i] = false;
                layers.velocity[i] = 127;
            }
        }
    }
    mgraphics.redraw();
}

function setplayhead() {
    var playheadPosition = getClipPlayheadPosition();
    var loopStart = safeLiveAPICall(function () { return Number(selected_clip_observer.get('loop_start')); });
    var loopEnd = safeLiveAPICall(function () { return Number(selected_clip_observer.get('loop_end')); });
    var clipLength = loopEnd - loopStart;

    isPlaying = true;

    for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        var newStep = Math.floor(((playheadPosition - loopStart) / clipLength) * row.length) % row.length;

        if (newStep !== row.currentStep) {
            var previousStep = row.currentStep;
            row.currentStep = newStep;

            // Stop the previous note if it's still playing
            outlet(2, "note", row.output_note, 0);
            outlet(3, r, row.modulation[newStep]);

            // Trigger the new step
            if (row.notes[newStep]) {
                triggerStepWithRepeats(r, newStep);
            } else {
                outlet(0, r, newStep, 0);
            }
            if (row.modActive[newStep]) {
                outlet(3, r, row.modulation[newStep]);
            }
        }
    }

    mgraphics.redraw();
}


function setSequenceLength(length) {
    var newSteps = parseInt(length);
    if (isNaN(newSteps) || newSteps < 1 || newSteps > maxSteps) {
        return;
    }

    var oldSteps = steps;
    steps = newSteps;

    var setLengthTask = createDeferredTask(function () {
        safeLiveAPICall(function () {
            var clipLength = selected_clip_observer.get('loop_end');
            var newClipLength = calculateClipLength();

            // Preserve existing data
            var existingNotes = selected_clip_observer.call("get_notes_extended", 0, 128, 0, clipLength);

            // Adjust layers
            var newNoteOn = [];
            var newVelocity = [];

            for (var i = 0; i < steps; i++) {
                if (i < oldSteps) {
                    // Preserve existing data for steps that still exist
                    newNoteOn[i] = layers.noteOn[i];
                    newVelocity[i] = layers.velocity[i];
                } else {
                    // Initialize new steps
                    newNoteOn[i] = false;
                    newVelocity[i] = 127;
                }
            }

            // Update layers
            layers.noteOn = newNoteOn;
            layers.velocity = newVelocity;

            // Update clip length
            selected_clip_observer.set('loop_start', 0);
            selected_clip_observer.set('loop_end', newClipLength);

            // Update notes in the visible range
            if (existingNotes && existingNotes.notes) {
                for (var i = 0; i < existingNotes.notes.length; i++) {
                    var note = existingNotes.notes[i];
                    var pitch = note.pitch;
                    var start_time = note.start_time;
                    var velocity = note.velocity;
                    var step = Math.floor(start_time / beatDivision);

                    if (step < steps && pitch === output_note) {
                        layers.noteOn[step] = true;
                        layers.velocity[step] = velocity;
                    }
                }
            }

            // Force a refresh of the clip's notes
            selected_clip_observer.property = "notes";
        });
    });

    setLengthTask.execute();
    updateDimensions();
    mgraphics.redraw();
}

function updateClipLength() {
    if (selected_clip_observer && selected_clip_observer.id !== 0) {
        var newClipLength = calculateClipLength();
        safeLiveAPICall(function () {
            selected_clip_observer.set('loop_start', 0);
            selected_clip_observer.set('loop_end', newClipLength);
        });
    }
}

function calculateClipLength() {
    return steps * beatDivision;
}

function setBeatDivision(division) {
    var oldBeatDivision = beatDivision;
    switch (division) {
        case "32nd":
            beatDivision = 0.125;
            break;
        case "16th":
            beatDivision = 0.25;
            break;
        case "8th":
            beatDivision = 0.5;
            break;
        case "quarter":
            beatDivision = 1;
            break;
        default:
            post("Invalid beat division: " + division + "\n");
            return;
    }

    // // Adjust the number of steps based on the new beat division
    // var newSteps = Math.round(steps * (oldBeatDivision / beatDivision));
    // newSteps = Math.min(Math.max(newSteps, 1), maxSteps);

    // for (var r = 0; r < rows.length; r++) {
    //     var row = rows[r];
    //     var oldLength = row.length;
    //     row.length = newSteps;

    //     // Adjust notes, velocities, and repeats to new length
    //     var newNotes = new Array(newSteps).fill(false);
    //     var newVelocities = new Array(newSteps).fill(127);
    //     var newRepeats = new Array(newSteps).fill(1);

    //     for (var i = 0; i < newSteps; i++) {
    //         var oldIndex = Math.floor(i * (oldLength / newSteps));
    //         newNotes[i] = row.notes[oldIndex] || false;
    //         newVelocities[i] = row.velocity[oldIndex] || 127;
    //         newRepeats[i] = row.repeat[oldIndex] || 1;
    //     }

    //     row.notes = newNotes;
    //     row.velocity = newVelocities;
    //     row.repeat = newRepeats;

    //     // Update clip with new subdivisions
    //     for (var i = 0; i < newSteps; i++) {
    //         updateClipNote(rowIndex, step, true);        }
    // }
    // steps = Math.round(steps * (oldBeatDivision / beatDivision));
    // steps = Math.min(Math.max(steps, 1), maxSteps);

    // steps = newSteps;
    updateClipLength();
    updateSequencer();
    mgraphics.redraw();
}

function msg_int(v) {
    if (inlet === 0) {
        setplayhead(v);
    } else if (inlet === 1) {
        focus_lock_enabled = (v !== 0);
        mgraphics.redraw();
    } else if (inlet === 2) {
        var rowIndex = Math.floor(v / 128);
        var note = v % 128;
        if (rowIndex >= 0 && rowIndex < rows.length) {
            rows[rowIndex].output_note = Math.max(0, Math.min(127, note));
        }
    }
}

function anything() {
    var args = arrayfromargs(messagename, arguments);

    if (inlet === 3) {
        if (args[0] === "layer") {
            if (args[1] === "noteOn" || args[1] === "velocity" || args[1] === "repeat" || args[1] === "modulation") {
                switchLayer(args[1]);
            }
        } else if (args[0] === "random") {
            randomizeLayer(currentLayer);
        } else if (args[0] === "clear") {
            clearLayer(currentLayer);
        } else if (args[0] === "beat_division") {
            setBeatDivision(args[1]);
        } else if (args[0] === "steps") {
            setSequenceLength(args[1]);
        } else if (args[0] === "Free") {
            focus_lock_enabled = false;
            mgraphics.redraw();
        } else if (args[0] === "Lock") {
            focus_lock_enabled = true;
            mgraphics.redraw();
        } else if (args[0] === '>' || args[0] === '<') {
            moveClipLoop(args[0]);
        }
        // else if (args[0] === "modulation") {
        //     switchLayer("modulation");
        // }
    }
}

function updateSequencer() {
    initializeLayers();
    updateDimensions();
    loadClipData();
    mgraphics.redraw();
}

function getClipPlayheadPosition() {
    if (selected_clip_observer && selected_clip_observer.id !== 0) {
        return Number(safeLiveAPICall(function () {
            return selected_clip_observer.get("playing_position");
        }));
    } else {
        return 0;
    }
}

function clearLayer(layer) {
    if (!selected_clip_observer || selected_clip_observer.id === 0) {
        return;
    }

    var clearTask = new Task(function () {
        safeLiveAPICall(function () {
            var loopStart = Number(selected_clip_observer.get('loop_start'));
            var loopEnd = Number(selected_clip_observer.get('loop_end'));
            var clipLength = loopEnd - loopStart;

            for (var r = 0; r < rows.length; r++) {
                var row = rows[r];
                row.length = Math.floor(clipLength / beatDivision);

                if (layer === 'noteOn') {
                    selected_clip_observer.call("remove_notes_extended", row.output_note, 1, loopStart, clipLength);
                    for (var i = 0; i < row.length; i++) {
                        row.notes[i] = false;
                        row.velocity[i] = 100; // Reset velocity to default
                        row.repeat[i] = 1; // Reset repeat to default
                    }
                } else if (layer === 'velocity') {
                    for (var i = 0; i < row.length; i++) {
                        row.velocity[i] = 100; // Reset to default velocity
                    }
                    // Update clip notes with reset velocities
                    var notesToUpdate = [];
                    for (var i = 0; i < row.length; i++) {
                        if (row.notes[i]) {
                            var note = {
                                pitch: row.output_note,
                                start_time: loopStart + (i * beatDivision),
                                duration: beatDivision,
                                velocity: row.velocity[i],
                                mute: 0
                            };
                            notesToUpdate.push(note);
                        }
                    }
                    if (notesToUpdate.length > 0) {
                        selected_clip_observer.call("remove_notes_extended", row.output_note, 1, loopStart, clipLength);
                        selected_clip_observer.call("add_new_notes", JSON.stringify({ notes: notesToUpdate }));
                    }
                }
                else if (layer === 'repeat') {
                    for (var i = 0; i < row.length; i++) {
                        row.repeat[i] = 1; // Reset to default repeat
                    }
                    // Update clip notes with reset subdivisions
                    var notesToUpdate = [];
                    for (var i = 0; i < row.length; i++) {
                        if (row.notes[i]) {
                            var note = {
                                pitch: row.output_note,
                                start_time: loopStart + (i * beatDivision),
                                duration: beatDivision,
                                velocity: row.velocity[i],
                                mute: 0
                            };
                            notesToUpdate.push(note);
                        }
                    }
                    if (notesToUpdate.length > 0) {
                        selected_clip_observer.call("remove_notes_extended", row.output_note, 1, loopStart, clipLength);
                        selected_clip_observer.call("add_new_notes", JSON.stringify({ notes: notesToUpdate }));
                    }
                }
                else if (layer === 'modulation') {
                    for (var i = 0; i < row.length; i++) {
                        row.modActive[i] = false;
                        row.modulation[i] = 0;
                        updateClipNote(r, i, false);
                        outlet(3, r, i, 0);
                    }
                }
            }
            // Force a refresh of the clip's notes
            selected_clip_observer.property = "notes";
        });
    });

    clearTask.execute();
    mgraphics.redraw();
}

function randomizeLayer(layer) {
    if (!selected_clip_observer || selected_clip_observer.id === 0) {
        return;
    }

    var randomizeTask = new Task(function () {
        safeLiveAPICall(function () {
            var loopStart = Number(selected_clip_observer.get('loop_start'));
            var loopEnd = Number(selected_clip_observer.get('loop_end'));
            var clipLength = loopEnd - loopStart;

            for (var r = 0; r < rows.length; r++) {
                var row = rows[r];
                row.length = Math.floor(clipLength / beatDivision);

                if (layer === 'velocity') {
                    var notesToUpdate = [];
                    for (var i = 0; i < row.length; i++) {
                        row.velocity[i] = Math.floor(Math.random() * 127) + 1;
                        if (row.notes[i]) {
                            var note = {
                                pitch: row.output_note,
                                start_time: loopStart + (i * beatDivision),
                                duration: beatDivision,
                                velocity: row.velocity[i],
                                mute: 0
                            };
                            notesToUpdate.push(note);
                        }
                    }
                    if (notesToUpdate.length > 0) {
                        selected_clip_observer.call("remove_notes_extended", row.output_note, 1, loopStart, clipLength);
                        selected_clip_observer.call("add_new_notes", JSON.stringify({ notes: notesToUpdate }));
                    }

                } else if (layer === 'noteOn') {
                    selected_clip_observer.call("remove_notes_extended", row.output_note, 1, loopStart, clipLength);
                    var notesToAdd = [];
                    for (var i = 0; i < row.length; i++) {
                        row.notes[i] = Math.random() < 0.5;
                        if (row.notes[i]) {
                            var note = {
                                pitch: row.output_note,
                                start_time: loopStart + (i * beatDivision),
                                duration: beatDivision,
                                velocity: row.velocity[i],
                                mute: 0
                            };
                            notesToAdd.push(note);
                        }
                    }
                    if (notesToAdd.length > 0) {
                        selected_clip_observer.call("add_new_notes", JSON.stringify({ notes: notesToAdd }));
                    }
                } else if (layer === 'repeat') {
                    var notesToUpdate = [];
                    for (var i = 0; i < row.length; i++) {
                        row.repeat[i] = Math.floor(Math.random() * 4) + 1; // Random repeat value between 1 and 4
                        if (row.notes[i]) {
                            var stepStart = loopStart + (i * beatDivision);
                            var repeats = row.repeat[i];
                            var interval = beatDivision / repeats;

                            for (var j = 0; j < repeats; j++) {
                                var noteStart = stepStart + (j * interval);
                                if (noteStart < loopEnd) {
                                    var note = {
                                        pitch: row.output_note,
                                        start_time: noteStart,
                                        duration: Math.min(interval, loopEnd - noteStart),
                                        velocity: row.velocity[i],
                                        mute: 0
                                    };
                                    notesToUpdate.push(note);
                                }
                            }
                        }
                    }
                    if (notesToUpdate.length > 0) {
                        selected_clip_observer.call("remove_notes_extended", row.output_note, 1, loopStart, clipLength);
                        selected_clip_observer.call("add_new_notes", JSON.stringify({ notes: notesToUpdate }));
                    }
                }
                else if (layer === 'modulation') {
                    for (var i = 0; i < row.length; i++) {
                        row.modActive[i] = Math.random() < 0.5;
                        row.modulation[i] = Math.floor(Math.random() * 127) + 1;
                        updateClipNote(r, i, false);
                        outlet(3, r, i, row.modActive[i] ? row.modulation[i] : 0);
                    }
                }
            }

            // Force a refresh of the clip's notes
            selected_clip_observer.property = "notes";
        });
    });

    randomizeTask.execute();
    mgraphics.redraw();
}

function moveClipLoop(direction) {
    if (!selected_clip_observer || selected_clip_observer.id === 0) {
        return;
    }

    safeLiveAPICall(function () {
        var loopStart = Number(selected_clip_observer.get('loop_start'));
        var loopEnd = Number(selected_clip_observer.get('loop_end'));
        var clipLength = loopEnd - loopStart;
        var newLoopStart, newLoopEnd;

        if (direction === '>') {
            newLoopStart = loopEnd;
            newLoopEnd = newLoopStart + clipLength;

            //set loop position moving forward
            selected_clip_observer.set('loop_end', newLoopEnd);
            selected_clip_observer.set('end_marker', newLoopEnd);

            selected_clip_observer.set('loop_start', newLoopStart);
            selected_clip_observer.set('start_marker', newLoopStart);


        } else if (direction === '<') {
            newLoopStart = Math.max(0, loopStart - clipLength);
            newLoopEnd = newLoopStart + clipLength;
            //set loop position moving back
            selected_clip_observer.set('loop_start', newLoopStart);
            selected_clip_observer.set('start_marker', newLoopStart);

            selected_clip_observer.set('loop_end', newLoopEnd);
            selected_clip_observer.set('end_marker', newLoopEnd);

        }
    });
}

function updateSequencerOnClipLoopChange() {
    if (!selected_clip_observer || selected_clip_observer.id === 0) {
        return;
    }

    safeLiveAPICall(function () {
        var loopStart = Number(selected_clip_observer.get('loop_start'));
        var loopEnd = Number(selected_clip_observer.get('loop_end'));
        var clipLength = loopEnd - loopStart;

        steps = Math.max(1, Math.floor(clipLength / beatDivision));

        for (var r = 0; r < rows.length; r++) {
            rows[r].length = steps;
            // Ensure that currentStep is within the new length
            rows[r].currentStep = rows[r].currentStep % steps;
        }

        loadClipData();
        updateDimensions();
        mgraphics.redraw();
    });
}

function loadClipData() {
    try {
        if (selected_clip_observer && selected_clip_observer.id !== 0) {
            var clipLength = safeLiveAPICall(function () { return selected_clip_observer.get('loop_end'); });
            var loopStart = safeLiveAPICall(function () { return selected_clip_observer.get('loop_start'); });

            if (clipLength === null || clipLength <= 0) {
                initializeLayers();
                mgraphics.redraw();
                return;
            }

            var notesDataString = safeLiveAPICall(function () {
                return selected_clip_observer.call("get_notes_extended", 0, 128, loopStart, clipLength - loopStart);
            });

            if (!notesDataString) {
                post("Error: No data returned from get_notes_extended\n");
                initializeLayers();
                mgraphics.redraw();
                return;
            }

            var notesData;
            try {
                notesData = JSON.parse(notesDataString);
            } catch (e) {
                post("Error parsing notes data: " + e.message + "\n");
                initializeLayers();
                mgraphics.redraw();
                return;
            }

            if (!notesData || !Array.isArray(notesData.notes)) {
                post("Error: Invalid notes data structure\n");
                initializeLayers();
                mgraphics.redraw();
                return;
            }

            initializeLayers();

            for (var r = 0; r < rows.length; r++) {
                var row = rows[r];
                row.length = Math.floor((clipLength - loopStart) / beatDivision);

                for (var i = 0; i < notesData.notes.length; i++) {
                    var note = notesData.notes[i];
                    var pitch = note.pitch;
                    var start_time = note.start_time;
                    var velocity = note.velocity;
                    var probability = note.probability !== undefined ? note.probability : 1;
                    var release_velocity = note.release_velocity !== undefined ? note.release_velocity : 0;
                    var mute = note.mute;

                    var step = Math.floor((start_time - loopStart) / beatDivision);
                    if (step >= 0 && step < row.length) {
                        var octave = Math.floor((pitch - row.output_note) / 12);
                        // if (pitch % 12 === row.output_note % 12) {
                        //     row.notes[step] = true;
                        //     row.velocity[step] = Math.round(velocity);
                        //     // row.probability[step] = probability;
                        //     // row.octave[step] = octave;
                        //     row.modulation[step] = Math.round(release_velocity);
                        //     row.modActive[step] = release_velocity > 0;
                        // } 

                        if (pitch === row.output_note) {
                            // Regular note
                            row.notes[step] = true;
                            row.velocity[step] = Math.round(velocity);
                        } else if (pitch === r && mute === 1) {
                            // Modulation (dummy) note
                            row.modActive[step] = true;
                            row.modulation[step] = Math.round(release_velocity);
                        }
                    }
                }
            }
            updateClipColor();
            mgraphics.redraw();
        } else {
            post("loadClipData: No valid clip observer\n");
        }
    } catch (error) {
        post("Error in loadClipData: " + error.message + "\n");
        initializeLayers();
        mgraphics.redraw();
    }
}

function createDeferredTask(func) {
    return new Task(func, this);
}

function saveClipData() {
    if (selected_clip_observer && selected_clip_observer.id !== 0) {
        safeLiveAPICall(function () {
            var clipLength = selected_clip_observer.get('loop_end');
            for (var r = 0; r < rows.length; r++) {
                var row = rows[r];
                selected_clip_observer.call("remove_notes_extended", row.output_note, 1, 0, clipLength);
                var notesToAdd = [];
                for (var i = 0; i < row.length; i++) {
                    if (row.notes[i]) {
                        var note = {
                            pitch: row.output_note,
                            start_time: i * (clipLength / row.length),
                            duration: clipLength / row.length,
                            velocity: row.velocity[i],
                            mute: 0
                        };
                        notesToAdd.push(note);
                    }
                }
                if (notesToAdd.length > 0) {
                    selected_clip_observer.call("add_new_notes", JSON.stringify({ notes: notesToAdd }));
                }
            }
        });
    }
}

function updateClipNote(rowIndex, step, shouldDefer) {
    post("updateClipNote called: rowIndex=" + rowIndex + ", step=" + step + ", shouldDefer=" + shouldDefer + "\n");

    if (!selected_clip_observer || selected_clip_observer.id === 0) {
        post("Error: No valid clip observer\n");
        return;
    }

    var row = rows[rowIndex];
    if (typeof row.output_note !== 'number' || row.output_note < 0 || row.output_note > 127) {
        post("Error: Invalid output_note " + row.output_note + "\n");
        return;
    }

    var updateFunction = function() {
        safeLiveAPICall(function() {
            var loopStart = Number(selected_clip_observer.get('loop_start'));
            var loopEnd = Number(selected_clip_observer.get('loop_end'));
            var stepStart = loopStart + (step * beatDivision);
            var stepDuration = beatDivision;

            post("Loop start: " + loopStart + ", Loop end: " + loopEnd + ", Step start: " + stepStart + ", Step duration: " + stepDuration + "\n");

            if (stepStart >= loopEnd) {
                post("Note is outside clip loop boundaries\n");
                return;
            }

            // Handle regular note
            post("Handling regular note. Note exists: " + row.notes[step] + "\n");
            if (row.notes[step]) {
                var notesToAdd = [];
                var repeats = row.repeat[step];
                var interval = stepDuration / repeats;

                post("Repeats: " + repeats + ", Interval: " + interval + "\n");

                for (var i = 0; i < repeats; i++) {
                    var noteStart = stepStart + (i * interval);
                    if (noteStart < loopEnd) {
                        var note = {
                            pitch: row.output_note,
                            start_time: noteStart,
                            duration: Math.min(interval, loopEnd - noteStart),
                            velocity: row.velocity[step],
                            mute: 0
                        };
                        notesToAdd.push(note);
                        post("Adding note: " + JSON.stringify(note) + "\n");
                    }
                }

                post("Removing existing notes for pitch " + row.output_note + "\n");
                selected_clip_observer.call("remove_notes_extended", row.output_note, 1, stepStart, stepDuration);
                
                if (notesToAdd.length > 0) {
                    post("Adding " + notesToAdd.length + " new notes\n");
                    selected_clip_observer.call("add_new_notes", JSON.stringify({notes: notesToAdd}));
                }
            } else {
                post("Removing any existing notes for pitch " + row.output_note + "\n");
                selected_clip_observer.call("remove_notes_extended", row.output_note, 1, stepStart, stepDuration);
            }

            // Handle modulation (dummy) note
            var dummyPitch = rowIndex;
            post("Handling modulation note. ModActive: " + row.modActive[step] + ", Dummy pitch: " + dummyPitch + "\n");
            
            if (row.modActive[step]) {
                var dummyNoteData = {
                    pitch: dummyPitch,
                    start_time: stepStart,
                    duration: stepDuration,
                    velocity: 1,
                    mute: 1,
                    release_velocity: row.modulation[step]
                };
                post("Removing existing dummy note\n");
                selected_clip_observer.call("remove_notes_extended", dummyPitch, 1, stepStart, stepDuration);
                
                post("Adding new dummy note: " + JSON.stringify(dummyNoteData) + "\n");
                selected_clip_observer.call("add_new_notes", JSON.stringify({notes: [dummyNoteData]}));
            } else {
                post("Removing any existing dummy note\n");
                selected_clip_observer.call("remove_notes_extended", dummyPitch, 1, stepStart, stepDuration);
            }

            post("Updating clip observer property\n");
            selected_clip_observer.property = "notes";
        });
    };

    if (shouldDefer) {
        post("Deferring update task\n");
        var updateTask = createDeferredTask(updateFunction);
        updateTask.execute();
    } else {
        post("Executing update function immediately\n");
        updateFunction();
    }
}


function updateOutputNote() {
    if (selected_clip_observer && selected_clip_observer.id !== 0) {
        var clipNotes = safeLiveAPICall(function () {
            return selected_clip_observer.call("get_notes_extended", 0, 128, 0, 0.25);
        });

        if (clipNotes && clipNotes.notes && clipNotes.notes.length > 0) {
            var newOutputNote = clipNotes.notes[0].pitch;
            if (typeof newOutputNote === 'number' && newOutputNote >= 0 && newOutputNote <= 127) {
                output_note = newOutputNote;
            }
        }
    }
}

function bang() {
    if (!checkLiveAPIConnection()) {
        return;
    }

    setplayhead();
    mgraphics.redraw();
}

var playheadUpdateTask = new Task(function () {
    bang();
}, this);
playheadUpdateTask.interval = 50;
playheadUpdateTask.repeat();

function ondrag(x, y, button, cmd, shift, capslock, option, ctrl) {
    if (!is_mouse_down) return;

    var dx = Math.abs(x - mouse_start_x);
    var dy = Math.abs(y - mouse_start_y);

    if (dx > 5 || dy > 5) {
        has_dragged = true;
    }

    if (has_dragged) {
        // post("Dragging! x: " + x + ", y: " + y + "\n");

        var totalHeight = height - (rows.length - 1) * rowSpacing;
        var baseRowHeight = totalHeight / rows.length;
        var rowIndex = Math.floor(y / (baseRowHeight + rowSpacing));

        // Ensure rowIndex is within bounds
        rowIndex = Math.max(0, Math.min(rows.length - 1, rowIndex));

        var row = rows[rowIndex];
        var step = getStepFromX(x);

        if (step >= 0 && step < row.length) {
            if (currentLayer === 'noteOn' && is_note_dragging) {
                if (focus_lock_enabled) {
                    rowIndex = focused_row;
                    step = focused_step;
                    row = rows[rowIndex];
                }
                if (row.notes[step] !== is_adding_notes) {
                    row.notes[step] = is_adding_notes;
                    updateClipNote(rowIndex, step, true);
                    outlet(1, rowIndex, step, row.notes[step] ? row.velocity[step] : 0);
                    if (step === row.currentStep) {
                        outlet(2, row.output_note, row.notes[step] ? row.velocity[step] : 0);
                    }
                    mgraphics.redraw();
                }
            } else if ((currentLayer === 'velocity' || currentLayer === 'modulation') && is_dragging) {
                if (focus_lock_enabled) {
                    updateSliderValueWithSensitivity(rowIndex, x, y, currentLayer);
                } else {
                    updateSliderValue(rowIndex, x, y, currentLayer);
                }
                mgraphics.redraw();
            } else if (currentLayer === 'repeat' && is_dragging) {
                updateRepeatValue(rowIndex, x, y);
                mgraphics.redraw();
            }
        }
    }

    // Check if the mouse button has been released
    if (button === 0) {
        post("Mouse released during drag!\n");
        handleMouseUp(x, y);
    }
}

function onidleout(x, y) {
    post("Mouse idle out! x: " + x + ", y: " + y + "\n");
    if (is_mouse_down) {
        post("Mouse up (from idle out)! x: " + x + ", y: " + y + "\n");
        handleMouseUp(x, y);
    }
}

function onmouseup(x, y, button, cmd, shift, capslock, option, ctrl) {
    post("Mouse up! x: " + x + ", y: " + y + "\n");
    handleMouseUp(x, y);
}

function handleMouseUp(x, y) {
    post("handleMouseUp called with x: " + x + ", y: " + y + "\n");

    if (!has_dragged) {
        post("Click detected (no drag)!\n");
    }

    if (!Array.isArray(rows) || rows.length === 0) {
        post("Error: rows array is invalid or empty\n");
        return;
    }

    var rowHeight = (height - (rows.length - 1) * rowSpacing) / rows.length;
    var rowIndex = Math.floor(y / (rowHeight + rowSpacing));

    // Ensure rowIndex is within bounds
    rowIndex = Math.max(0, Math.min(rows.length - 1, rowIndex));

    var row = rows[rowIndex];
    if (!row) {
        post("Error: Invalid row at index " + rowIndex + "\n");
        return;
    }

    var step = getStepFromX(x);
    post("Calculated rowIndex: " + rowIndex + ", step: " + step + "\n");

    if (step >= 0 && step < row.length) {
        if (currentLayer === 'modulation') {
            post("Current layer is modulation\n");
            post("drag_start_step: " + drag_start_step + ", has_dragged: " + has_dragged + "\n");
            if (step === drag_start_step && !has_dragged) {
                post("Toggling modulation state\n");
                row.modActive[step] = !row.modActive[step];
                post("New modActive state: " + row.modActive[step] + "\n");
                if (!row.modActive[step]) {
                    row.modulation[step] = 0;
                    outlet(3, rowIndex, 0);
                } else if (row.modulation[step] === 0) {
                    row.modulation[step] = 64;
                    outlet(3, rowIndex, 64);
                }
                updateClipNote(rowIndex, step, true);
            }
        }
    } else {
        post("Step " + step + " is out of bounds for row " + rowIndex + "\n");
    }

    is_mouse_down = false;
    has_dragged = false;
    is_dragging = false;
    is_note_dragging = false;
    drag_start_step = -1;
    if (!focus_lock_enabled) {
        focused_step = -1;
    }
    mgraphics.redraw();
}

function onclick(x, y, button, cmd, shift, capslock, option, ctrl) {
    post("Mouse down! x: " + x + ", y: " + y + "\n");
    is_mouse_down = true;
    has_dragged = false;
    mouse_start_x = x;
    mouse_start_y = y;

    var totalHeight = height - (rows.length - 1) * rowSpacing;
    var baseRowHeight = totalHeight / rows.length;
    var rowIndex = Math.floor(y / (baseRowHeight + rowSpacing));

    // Ensure rowIndex is within bounds
    rowIndex = Math.max(0, Math.min(rows.length - 1, rowIndex));

    post("Selected row index: " + rowIndex + "\n");

    var row = rows[rowIndex];
    var step = getStepFromX(x);
    drag_start_step = step;

    if (step >= 0 && step < row.length) {
        if (currentLayer === 'noteOn') {
            is_note_dragging = true;
            is_adding_notes = !row.notes[step];
            row.notes[step] = is_adding_notes;
            updateClipNote(rowIndex, step, true);
            outlet(1, rowIndex, step, row.notes[step] ? row.velocity[step] : 0);
            if (step === row.currentStep) {
                outlet(2, row.output_note, row.notes[step] ? row.velocity[step] : 0);
            }
        } else if (currentLayer === 'repeat') {
            is_dragging = true;
            updateRepeatValue(rowIndex, x, y);
        } else if (currentLayer === 'velocity' || currentLayer === 'modulation') {
            is_dragging = true;
            initial_click_x = x;
            initial_click_y = y;
            if (currentLayer === 'velocity') {
                initial_slider_value = row.velocity[step];
                post("Velocity layer: initial value = " + initial_slider_value + "\n");
            } else {
                post("Modulation layer: step " + step + ", current state: active=" + row.modActive[step] + ", value=" + row.modulation[step] + "\n");
                initial_slider_value = row.modulation[step];
                row.modActive[step] = !row.modActive[step];
                post("Toggled modulation active state to: " + row.modActive[step] + "\n");
                if (row.modActive[step] && row.modulation[step] === 0) {
                    row.modulation[step] = 64;
                    post("Set initial modulation value to 64\n");
                }
                updateClipNote(rowIndex, step, true);
                outlet(3, rowIndex, step, row.modActive[step] ? row.modulation[step] : 0);
                post("Sent modulation value: " + (row.modActive[step] ? row.modulation[step] : 0) + "\n");
            }
        }

        if (focus_lock_enabled) {
            focused_row = rowIndex;
            focused_step = step;
        } else {
            focused_row = -1;
            focused_step = -1;
        }
    }

    post("drag_start_step set to: " + drag_start_step + "\n");
    post("focused_row set to: " + focused_row + "\n");
    mgraphics.redraw();
}

function updateSliderValue(rowIndex, x, y, layer) {
    var row = rows[rowIndex];
    var step = focus_lock_enabled ? focused_step : getStepFromX(x);
    if (focus_lock_enabled) {
        rowIndex = focused_row;
        row = rows[rowIndex];
    }
    if (step >= 0 && step < row.length) {
        var rowHeight = height / rows.length;
        var yOffset = rowIndex * rowHeight;
        var newValue = Math.floor(((rowHeight - (y - yOffset)) / rowHeight) * 127);
        newValue = Math.max(1, Math.min(127, newValue)); // Ensure velocity is never 0

        if (layer === 'velocity' && row.notes[step]) {
            if (row.velocity[step] !== newValue) {
                row.velocity[step] = newValue;
                updateClipNoteVelocity(rowIndex, step, newValue);
                outlet(1, rowIndex, step, newValue);
                if (step === row.currentStep) {
                    outlet(2, row.output_note, newValue);
                }
            }
        } else if (layer === 'modulation' && row.modActive[step] && row.modulation[step] !== newValue) {
            row.modulation[step] = newValue;
            outlet(3, rowIndex, newValue);
        }
        mgraphics.redraw();
    }
    // post("updating slider value" + "\n")
}

function updateSliderValueWithSensitivity(rowIndex, x, y, layer) {
    if (focus_lock_enabled) {
        rowIndex = focused_row;
    }
    var row = rows[rowIndex];
    if (focused_step >= 0 && focused_step < row.length) {
        var dx = Math.abs(x - initial_click_x);  // Use absolute value of x delta

        // Invert sensitivity calculation
        var maxDistance = width / 2;  // Use half the width as the maximum distance
        var sensitivity = Math.min(2, 0.5 + (dx / maxDistance) * 1.5);

        var dy = initial_click_y - y;

        var baseRowHeight = (height - (rows.length - 1) * rowSpacing) / rows.length;
        var currentRowHeight = baseRowHeight * 2; // Double the height when editing

        var delta = dy / sensitivity;  // Divide by sensitivity for finer control
        var newValue = initial_slider_value + (delta / currentRowHeight) * 127;
        newValue = Math.max(1, Math.min(127, Math.round(newValue))); // Ensure value is between 1 and 127

        if (layer === 'velocity' && row.notes[focused_step] && row.velocity[focused_step] !== newValue) {
            row.velocity[focused_step] = newValue;
            updateClipNote(rowIndex, focused_step, true);
            outlet(1, rowIndex, focused_step, newValue);
            if (focused_step === row.currentStep) {
                outlet(2, row.output_note, newValue);
            }
        } else if (layer === 'modulation' && row.modActive[focused_step] && row.modulation[focused_step] !== newValue) {
            row.modulation[focused_step] = newValue;
            updateClipNote(rowIndex, focused_step, true);
            outlet(3, rowIndex, newValue);
        }
        mgraphics.redraw();
    }
}

function updateClipNoteVelocity(rowIndex, step, velocity) {
    if (!selected_clip_observer || selected_clip_observer.id === 0) return;

    var updateTask = new Task(function () {
        safeLiveAPICall(function () {
            var row = rows[rowIndex];
            var loopStart = Number(selected_clip_observer.get('loop_start'));
            var loopEnd = Number(selected_clip_observer.get('loop_end'));
            var stepStart = loopStart + (step * beatDivision);
            var stepDuration = beatDivision;

            if (stepStart >= loopEnd) return;

            var existingNotes = selected_clip_observer.call("get_notes_extended", row.output_note, 1, stepStart, stepDuration);
            if (existingNotes.notes && existingNotes.notes.length > 0) {
                // Note exists, update its velocity
                var noteData = {
                    pitch: row.output_note,
                    start_time: stepStart,
                    duration: stepDuration,
                    velocity: velocity,
                    mute: 0
                };

                try {
                    // Remove existing note
                    selected_clip_observer.call("remove_notes_extended", row.output_note, 1, stepStart, stepDuration);
                    // Add updated note
                    selected_clip_observer.call("add_new_notes", JSON.stringify({ notes: [noteData] }));
                } catch (error) {
                    post("Error updating note velocity: " + error.message + "\n");
                }
            }
        });
    });
    updateTask.execute();
}

// function onmouseup(x, y) {
//     post("mousing up!" + "/n")
//     var rowHeight = (height - (rows.length - 1) * rowSpacing) / rows.length;
//     var rowIndex = Math.floor(y / (rowHeight + rowSpacing));
//     var row = rows[rowIndex];
//     var step = getStepFromX(x);

//     if (step >= 0 && step < row.length) {
//         if (currentLayer === 'modulation') {
//             if (step === drag_start_step && !is_dragging) {
//                 post("is dragging: " + is_dragging + "\n");
//                 // If it's a click (not a drag), toggle the modulation state
//                 row.modActive[step] = !row.modActive[step];
//                 if (!row.modActive[step]) {
//                     row.modulation[step] = 0;
//                     outlet(3, rowIndex, 0); // Output 0 when deactivating
//                 } else if (row.modulation[step] === 0) {
//                     row.modulation[step] = 64; // Set to middle value when activating
//                     outlet(3, rowIndex, 64);
//                 }
//                 updateClipNote(rowIndex, step, true);
//             }
//         }
//     }

//     is_dragging = false;
//     is_note_dragging = false;
//     drag_start_step = -1;
//     if (!focus_lock_enabled) {
//         focused_step = -1;
//     }
//     mgraphics.redraw();
// }


// function onidle(x, y) {
//     if (!is_dragging) {
//         hover_step = getStepFromX(x);
//         mgraphics.redraw();
//     }
// }

function getStepFromX(x) {
    var maxRowLength = Math.max.apply(Math, rows.map(function (row) { return row.length; }));
    for (var i = 0; i < maxRowLength; i++) {
        var groupIndex = Math.floor(i / 4);
        var stepX = i * cellWidth + groupIndex * groupSpacing;
        if (x >= stepX && x < stepX + cellWidth) {
            return i;
        }
    }
    return -1;
}



function updateRepeatValue(rowIndex, x, y) {
    var row = rows[rowIndex];
    var step = getStepFromX(x);
    if (step >= 0 && step < row.length) {
        var relativeX = x - (step * cellWidth + Math.floor(step / 4) * groupSpacing);
        var repeatValue = Math.floor((relativeX / cellWidth) * 4) + 1; // 1 to 4 repeats
        repeatValue = Math.max(1, Math.min(4, repeatValue));
        if (row.repeat[step] !== repeatValue) {
            row.repeat[step] = repeatValue;
            // Only update the clip if there's actually a note at this step
            if (row.notes[step]) {
                updateClipNote(rowIndex, step, true);
            }
            mgraphics.redraw();
        }
    }
}

function triggerStep(rowIndex, step) {
    var row = rows[rowIndex];
    if (row.notes[step]) {
        var repeats = row.repeat[step];
        var interval = beatDivision / repeats;
        var stepDuration = beatDivision * 1000; // Convert to milliseconds

        updateClipNote(rowIndex, step, true);

        for (var i = 0; i < repeats; i++) {
            var delay = i * interval * 1000; // Convert to milliseconds
            var noteDuration = Math.min(interval * 0.9, 0.1) * 1000; // 90% of interval or 100ms, whichever is shorter

            var noteOnTask = new Task(function (r, n, v) {
                outlet(2, "note", n, v);
                outlet(0, r, step, v);
            }, this, rowIndex, row.output_note, row.velocity[step]);

            var noteOffTask = new Task(function (r, n) {
                outlet(2, "note", n, 0);
            }, this, rowIndex, row.output_note);

            noteOnTask.schedule(delay);
            noteOffTask.schedule(delay + noteDuration);
        }
    } else {
        outlet(2, "note", row.output_note, 0);
        outlet(0, rowIndex, step, 0);
        updateClipNote(rowIndex, step, true);
    }
}

function triggerStepWithRepeats(rowIndex, step) {
    var row = rows[rowIndex];
    var repeats = row.repeat[step];
    var interval = beatDivision / repeats;
    var stepDuration = beatDivision * 1000; // Convert to milliseconds

    for (var i = 0; i < repeats; i++) {
        var delay = i * interval * 1000; // Convert to milliseconds
        var noteDuration = Math.min(interval * 0.9, 0.1) * 1000; // 90% of interval or 100ms, whichever is shorter

        var noteOnTask = new Task(function (r, n, v) {
            outlet(2, "note", n, v);
            outlet(0, r, step, v);
        }, this, rowIndex, row.output_note, row.velocity[step]);

        var noteOffTask = new Task(function (r, n) {
            outlet(2, "note", n, 0);
        }, this, rowIndex, row.output_note);

        noteOnTask.schedule(delay);
        noteOffTask.schedule(delay + noteDuration);
    }
}

function updateClipColor() {
    if (selected_clip_observer && selected_clip_observer.id !== 0) {
        safeLiveAPICall(function () {
            var colorIndex = selected_clip_observer.get('color_index');
            // post('color index ' + colorIndex + "\n");
            // post('abletonColors available: ' + (typeof abletonColors !== 'undefined') + "\n");
            // post('abletonColors keys: ' + Object.keys(abletonColors).join(', ') + "\n");

            if (typeof abletonColors !== 'undefined' && colorIndex in abletonColors) {
                var rgb = abletonColors[colorIndex];
                // Convert RGB values to 0-1 range
                clipColor = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 0.5];
                // post('clip color ' + clipColor.join(',') + "\n");
            } else {
                // Default color if index is not found or abletonColors is undefined
                clipColor = [0.5, 0.5, 0.5, 0.5];
                // post('clip color defaulted to ' + clipColor.join(',') + "\n");
                if (typeof abletonColors === 'undefined') {
                    // post('Error: abletonColors is undefined\n');
                } else if (!(colorIndex in abletonColors)) {
                    // post('Error: Color index ' + colorIndex + ' not found in abletonColors\n');
                    // post('abletonColors content: ' + JSON.stringify(abletonColors) + "\n");
                }
            }
        });
    }
}

function drawRoundedRect(x, y, w, h, r) {
    with (mgraphics) {
        move_to(x + r, y);
        line_to(x + w - r, y);
        curve_to(x + w, y, x + w, y, x + w, y + r);
        line_to(x + w, y + h - r);
        curve_to(x + w, y + h, x + w, y + h, x + w - r, y + h);
        line_to(x + r, y + h);
        curve_to(x, y + h, x, y + h, x, y + h - r);
        line_to(x, y + r);
        curve_to(x, y, x, y, x + r, y);
        close_path();
    }
}

function paint() {
    with (mgraphics) {
        set_source_rgba(0, 0, 0, 0);
        paint();

        var totalHeight = height - (rows.length - 1) * rowSpacing;
        var baseRowHeight = totalHeight / rows.length;
        var growingRowIndex = -1;

        if (focus_lock_enabled && is_dragging && (currentLayer === 'velocity' || currentLayer === 'modulation')) {
            growingRowIndex = focused_row;
        }

        var growingRowHeight = baseRowHeight * 2;
        var shrinkingRowHeight = growingRowIndex !== -1 ?
            (totalHeight - growingRowHeight) / (rows.length - 1) :
            baseRowHeight;

        var yOffset = 0;

        for (var rowIndex = 0; rowIndex < rows.length; rowIndex++) {
            var row = rows[rowIndex];
            var rowHeight = (rowIndex === growingRowIndex) ? growingRowHeight : shrinkingRowHeight;

            // Draw grid
            set_source_rgba(1, 1, 1, 0.2);
            set_line_width(0.5);
            for (var i = 0; i < row.length; i++) {
                var groupIndex = Math.floor(i / 4);
                var x = i * cellWidth + groupIndex * groupSpacing;
                rectangle(x, yOffset, cellWidth, rowHeight);
                stroke();
            }

            // Draw notes and other elements
            for (var i = 0; i < row.length; i++) {
                var groupIndex = Math.floor(i / 4);
                var x = i * cellWidth + groupIndex * groupSpacing;

                // Add x spacing between steps
                var stepSpacing = 5;
                var adjustedCellWidth = cellWidth - stepSpacing;
                var adjustedX = x + stepSpacing / 2;

                if (row.notes[i]) {
                    set_source_rgba(clipColor[0], clipColor[1], clipColor[2], clipColor[3] * 2);
                    rectangle(adjustedX, yOffset + 1, adjustedCellWidth, rowHeight - 2);
                    fill();

                    if (currentLayer === 'velocity') {
                        var velocityHeight = (row.velocity[i] / 127) * (rowHeight - 12) + 5;
                        set_source_rgba(lcdcolor[0], lcdcolor[1], lcdcolor[2], lcdcolor[3]);
                        drawRoundedRect(adjustedX + 2, yOffset + rowHeight - velocityHeight - 1, adjustedCellWidth - 4, velocityHeight, 3);
                        fill();

                        // Draw numerical display
                        set_source_rgba(1, 1, 1, 1);
                        set_font_size(10);
                        var text = row.velocity[i].toString();
                        var textWidth = text_measure(text)[0];
                        move_to(adjustedX + (adjustedCellWidth - textWidth) / 2, yOffset + rowHeight - 5);
                        text_path(text);
                        fill();
                    } else if (currentLayer === 'repeat') {
                        var repeatWidth = (row.repeat[i] / 4) * (adjustedCellWidth - 4);
                        set_source_rgba(0, 0.7, 0.7, 0.8);
                        drawRoundedRect(adjustedX + 2, yOffset + rowHeight - 11, repeatWidth, 8, 2);
                        fill();
                    }
                }

                if (currentLayer === 'modulation') {
                    if (row.modActive[i]) {
                        var modulationHeight = (row.modulation[i] / 127) * (rowHeight - 12) + 5;
                        set_source_rgba(1, 0.349, 0.373, 1);
                        drawRoundedRect(adjustedX + 2, yOffset + rowHeight - modulationHeight - 1, adjustedCellWidth - 4, modulationHeight, 3);
                        fill();

                        // Draw numerical display
                        set_source_rgba(1, 1, 1, 1);
                        set_font_size(10);
                        var text = row.modulation[i].toString();
                        var textWidth = text_measure(text)[0];
                        move_to(adjustedX + (adjustedCellWidth - textWidth) / 2, yOffset + rowHeight - 5);
                        text_path(text);
                        fill();
                    } else {
                        set_source_rgba(0.3, 0.3, 0.3, 0.5);
                        drawRoundedRect(adjustedX + 2, yOffset + rowHeight - 7, adjustedCellWidth - 4, 6, 2);
                        fill();
                    }
                }

                if (focus_lock_enabled && rowIndex === focused_row && i === focused_step) {
                    set_source_rgba(focuscolor[0], focuscolor[1], focuscolor[2], focuscolor[3]);
                    rectangle(adjustedX, yOffset + 1, adjustedCellWidth, rowHeight - 2);
                    fill();
                } else if (i === hover_step && !is_dragging) {
                    set_source_rgba(hovercolor[0], hovercolor[1], hovercolor[2], hovercolor[3]);
                    rectangle(adjustedX, yOffset + 1, adjustedCellWidth, rowHeight - 2);
                    fill();
                }
            }

            // Draw playhead
            if (isPlaying) {
                var groupIndex = Math.floor(row.currentStep / 4);
                var playheadX = row.currentStep * cellWidth + groupIndex * groupSpacing;
                set_source_rgba(clipColor[0], clipColor[1], clipColor[2], 1);
                set_line_width(2);
                move_to(playheadX, yOffset);
                line_to(playheadX, yOffset + rowHeight);
                stroke();
            }

            yOffset += rowHeight + (rowIndex < rows.length - 1 ? rowSpacing : 0);
        }
    }
}

function switchLayer(layer) {
    if (layer === 'noteOn' || layer === 'velocity' || layer === 'repeat' || layer === 'modulation') {
        currentLayer = layer;
        mgraphics.redraw();
    } else {
        currentLayer = 'noteOn';
    }
}

function updateDimensions() {
    width = box.rect[2] - box.rect[0];
    height = box.rect[3] - box.rect[1];
    rowSpacing = 5; // Adjust this value to increase/decrease space between rows
    var maxRowLength = Math.max.apply(Math, rows.map(function (row) { return row.length; }));
    var totalGroupSpacing = groupSpacing * (Math.floor(maxRowLength / 4) - 1);
    cellWidth = (width - totalGroupSpacing) / maxRowLength;
    groupSpacing = width * 0.005; //spacing between groups of 4 steps
    mgraphics.redraw();
}

function onresize(w, h) {
    updateDimensions();
}

function syncSequencerWithClip() {
    if (selected_clip_observer && selected_clip_observer.id !== 0) {
        loadClipData();
    }
}

//having this on 100ms causes big perf issues in max editor, works fine at 1000 tho :)
var syncTask = new Task(function () {
    syncSequencerWithClip();
}, this);
syncTask.interval = 1000;
syncTask.repeat();

function clipObserverCallback(args) {
    if (args[0] === "notes" && selected_clip_observer && selected_clip_observer.id !== 0) {
        loadClipData();
    }
}

function track_changed() {
    var trackPath = "this_device canonical_parent";
    var clipSlotIndex = safeLiveAPICall(trackPath, "playing_slot_index");
    if (clipSlotIndex >= 0) {
        updateClipObserver();
    } else {
        selected_clip_observer.property = "";
        initializeLayers();
        mgraphics.redraw();
    }
}

function cleanup() {
    if (live_set_observer) {
        live_set_observer.property = "";
    }
    if (selected_track_observer) {
        selected_track_observer.property = "";
    }
    if (selected_clip_observer) {
        selected_clip_observer.property = "";
    }
    if (syncTask) {
        syncTask.cancel();
    }
}

function onerror(error) {
    post("Global error: " + error.message + "\n");
    for (var i in error) {
        post(i + ": " + error[i] + "\n");
    }
}

// New functions for multi-row functionality

function setRowPlaybackMode(rowIndex, mode) {
    if (rowIndex >= 0 && rowIndex < rows.length) {
        rows[rowIndex].playbackMode = mode;
    }
}

function advanceRowStep(rowIndex) {
    var row = rows[rowIndex];
    switch (row.playbackMode) {
        case 'forward':
            row.currentStep = (row.currentStep + 1) % row.length;
            break;
        case 'reverse':
            row.currentStep = (row.currentStep - 1 + row.length) % row.length;
            break;
        case 'random':
            row.currentStep = Math.floor(Math.random() * row.length);
            break;
    }
}

function randomizeRow(rowIndex) {
    if (rowIndex >= 0 && rowIndex < rows.length) {
        var row = rows[rowIndex];
        for (var i = 0; i < row.length; i++) {
            row.notes[i] = Math.random() < 0.5;
            row.velocity[i] = Math.floor(Math.random() * 127) + 1;
        }
        saveClipData();
        mgraphics.redraw();
    }
}

function clearRow(rowIndex) {
    if (rowIndex >= 0 && rowIndex < rows.length) {
        var row = rows[rowIndex];
        for (var i = 0; i < row.length; i++) {
            row.notes[i] = false;
            row.velocity[i] = 127;
        }
        saveClipData();
        mgraphics.redraw();
    }
}

function setRowOutputNote(rowIndex, note) {
    if (rowIndex >= 0 && rowIndex < rows.length) {
        rows[rowIndex].output_note = Math.max(0, Math.min(127, note));
    }
}

// Additional utility functions

function getRowFromY(y) {
    var rowHeight = height / rows.length;
    return Math.floor(y / rowHeight);
}


// function logState() {
//     post("Current state:\n");
//     for (var i = 0; i < rows.length; i++) {
//         post("Row " + i + ":\n");
//         post("  Length: " + rows[i].length + "\n");
//         post("  Playback mode: " + rows[i].playbackMode + "\n");
//         post("  Output note: " + rows[i].output_note + "\n");
//         post("  Notes: " + rows[i].notes.join(", ") + "\n");
//         post("  Velocities: " + rows[i].velocity.join(", ") + "\n");
//     }
// }

// Expose some functions to Max

function setRowLength(rowIndex, length) {
    setSequenceLength(rowIndex, length);
}

function getRowLength(rowIndex) {
    if (rowIndex >= 0 && rowIndex < rows.length) {
        return rows[rowIndex].length;
    }
    return -1;
}

function setRowPlaybackMode(rowIndex, mode) {
    if (rowIndex >= 0 && rowIndex < rows.length) {
        rows[rowIndex].playbackMode = mode;
    }
}

function getRowPlaybackMode(rowIndex) {
    if (rowIndex >= 0 && rowIndex < rows.length) {
        return rows[rowIndex].playbackMode;
    }
    return "";
}

// Initialize the script
initializeScript();
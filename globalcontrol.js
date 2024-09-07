// JSUI max for live object for ableton live macro and midi control
autowatch = 1;
inlets = 1;
outlets = 0;

mgraphics.init();
mgraphics.autofill = 0;

var live_api = null;
var view_api = null;
var device_api = null;
var isLiveAPIConnected = false;
var mapping = false;
var mappingTarget = -1;
var observing = false;

// Global variables
var FADER_SPACING = 2;
var COLUMN_SPACING = 5;
var BUTTON_PADDING = 4;
var LEFT_COLUMN_WIDTH = 50;
var FADER_COUNT = 8; // Assuming 8 faders, adjust if needed
var width, height; // These will be set in updateDimensions()
var FADER_WIDTH; // This will be calculated in updateDimensions()

var controls = [];
var hoverIndex = -1;
var focusedIndex = -1;
var isDragging = false;
var initialClickX = 0;
var initialClickY = 0;
var initialSliderValue = 0;

var DEBUG = false;

var midiMappingMode = false;

var messnamed = this.patcher.message;

function log(message) {
    if (DEBUG) {
        post("GlobalControl: " + message + "\n");
    }
}

function loadbang() {
    log("loadbang called");
    
    // Initialize controls with default values
    controls = [];
    for (var i = 0; i < FADER_COUNT; i++) {
        controls.push({
            name: "Control " + (i + 1),
            value: 0,
            param_id: null,
            min: 0,
            max: 1
        });
    }

    initializeScript();
}

function initializeScript() {
    updateDimensions();
    
    var initTask = new Task(function() {
        try {
            if (checkLiveAPIConnection()) {
                setupDeviceAPI();
                updateDeviceParameters();
                setupObservers();
            } else {
                var retryTask = new Task(delayedInitLiveAPI, this);
                retryTask.schedule(1000);
            }
        } catch (error) {
            log("Error in initializeScript delayed task: " + error.message);
        }
    }, this);
    initTask.schedule(1000);
}

function setupDeviceAPI() {
    if (!device_api) {
        try {
            device_api = new LiveAPI("this_device");
            log("Device API initialized successfully");
        } catch (error) {
            log("Error initializing Device API: " + error.message);
        }
    }
}

function updateDimensions() {
    width = box.rect[2] - box.rect[0];
    height = box.rect[3] - box.rect[1];
    FADER_WIDTH = (width - LEFT_COLUMN_WIDTH - (COLUMN_SPACING * 2) - (FADER_SPACING * (FADER_COUNT - 1))) / FADER_COUNT;
    mgraphics.redraw();
}

function checkLiveAPIConnection() {
    try {
        if (live_api === null) {
            live_api = new LiveAPI();
        }
        if (view_api === null) {
            view_api = new LiveAPI(live_callback, "live_set view");
        }
        if (device_api === null) {
            device_api = new LiveAPI("this_device");
        }
        live_api.path = "live_set";
        var trackCount = live_api.get("tracks").length;
        if (trackCount !== "get: no valid object set") {
            isLiveAPIConnected = true;
            log("Live API connected successfully");
            return true;
        } else {
            throw new Error("Invalid Live API object");
        }
    } catch (error) {
        log("Error in checkLiveAPIConnection: " + error.message);
        live_api = null;
        view_api = null;
        device_api = null;
        isLiveAPIConnected = false;
        return false;
    }
}

function delayedInitLiveAPI() {
    if (checkLiveAPIConnection()) {
        setupObservers();
    }
}

function setupObservers() {
    try {
        if (!isLiveAPIConnected) {
            log("Live API not connected. Cannot setup observers.");
            return;
        }
        updateDeviceParameters();
    } catch (error) {
        log("Error in setupObservers: " + error.message);
    }
}

function updateDeviceParameters() {
    if (!device_api) return;

    try {
        var deviceParams = device_api.get("parameters");
        for (var i = 0; i < Math.min(controls.length, deviceParams.length); i += 2) {
            var paramId = deviceParams[i];
            device_api.goto("parameters", i);
            var paramName = device_api.get("name");
            var paramValue = device_api.get("value");
            var paramMin = device_api.get("min");
            var paramMax = device_api.get("max");
            
            // Only update the control if it has a param_id (i.e., it was previously mapped)
            if (controls[i/2].param_id) {
                controls[i/2].name = paramName;
                controls[i/2].value = (paramValue - paramMin) / (paramMax - paramMin);
                controls[i/2].min = paramMin;
                controls[i/2].max = paramMax;
            }
            
            device_api.goto("this_device");
        }
        mgraphics.redraw();
    } catch (error) {
        log("Error updating device parameters: " + error.message);
    }
}

function paint() {
    log("paint called");
    with (mgraphics) {
        // Clear the background with full transparency
        set_source_rgba(0, 0, 0, 0);
        rectangle(0, 0, width, height);
        fill();
        
        var faderHeight = height - COLUMN_SPACING * 2;
        
        // Draw left column background
        set_source_rgba(0.2, 0.2, 0.2, 0.5);
        rectangle(COLUMN_SPACING, COLUMN_SPACING, LEFT_COLUMN_WIDTH - COLUMN_SPACING, height - COLUMN_SPACING * 2);
        fill();
        
        // Draw map button in the left column
        if (mapping) {
            set_source_rgba(0.8, 0.2, 0.2, 1); // Red color for active mapping
        } else {
            set_source_rgba(0.5, 0.5, 0.5, 1);
        }
        rectangle(COLUMN_SPACING + BUTTON_PADDING, height - 30, LEFT_COLUMN_WIDTH - COLUMN_SPACING - BUTTON_PADDING * 2, 25);
        fill();
        set_source_rgba(1, 1, 1, 1);
        set_font_size(12);
        var mapText = mapping ? "Cancel" : "Map";
        var textMeasure = text_measure(mapText);
        move_to(COLUMN_SPACING + BUTTON_PADDING + (LEFT_COLUMN_WIDTH - COLUMN_SPACING - BUTTON_PADDING * 2 - textMeasure[0]) / 2, height - 12);
        text_path(mapText);
        fill();

        // Draw faders
        for (var i = 0; i < FADER_COUNT; i++) {
            var x = LEFT_COLUMN_WIDTH + COLUMN_SPACING + (FADER_WIDTH + FADER_SPACING) * i;
            
            // Draw fader background
            set_source_rgba(0.3, 0.3, 0.3, 0.5);
            rectangle(x, COLUMN_SPACING, FADER_WIDTH, faderHeight);
            fill();
            
            // Draw fader value
            set_source_rgba(0.8, 0.8, 0.8, 0.7);
            if (controls[i].min < 0 && controls[i].max > 0) {
                // Bipolar parameter
                var centerY = COLUMN_SPACING + faderHeight / 2;
                var valueHeight = Math.abs(controls[i].value - 0.5) * faderHeight;
                if (controls[i].value > 0.5) {
                    rectangle(x, centerY - valueHeight, FADER_WIDTH, valueHeight);
                } else {
                    rectangle(x, centerY, FADER_WIDTH, valueHeight);
                }
            } else {
                // Unipolar parameter
                var valueHeight = faderHeight * controls[i].value;
                rectangle(x, COLUMN_SPACING + faderHeight - valueHeight, FADER_WIDTH, valueHeight);
            }
            fill();
            
            // Draw fader stroke
            if (i === focusedIndex) {
                set_source_rgba(0.7, 0.7, 0.7, 1); // Lighter color for focused fader
            } else {
                set_source_rgba(0, 0, 0, 1); // Black for unfocused faders
            }
            rectangle(x, COLUMN_SPACING, FADER_WIDTH, faderHeight);
            stroke();
            
            // Draw control name and path near the top
            set_source_rgba(1, 1, 1, 1);
            set_font_size(10);
            var lines = wrapText(controls[i].name, FADER_WIDTH - 4);
            for (var j = 0; j < lines.length; j++) {
                move_to(x + 2, COLUMN_SPACING + 12 + j * 12);
                text_path(lines[j]);
                fill();
            }
            
            // Draw parameter value text near the bottom
            set_font_size(12);
            var valueText = getParameterValueText(controls[i]);
            var textMeasure = mgraphics.text_measure(valueText);
            move_to(x + (FADER_WIDTH - textMeasure[0]) / 2, COLUMN_SPACING + faderHeight - 5);
            text_path(valueText);
            fill();
            
            // Draw hover effect
            if (i === hoverIndex) {
                set_source_rgba(1, 1, 1, 0.2);
                rectangle(x, COLUMN_SPACING, FADER_WIDTH, faderHeight);
                fill();
            }
        }
        
        // Draw mapping instructions if in mapping mode
        if (mapping) {
            set_source_rgba(1, 1, 1, 0.8);
            set_font_size(12);
            move_to(LEFT_COLUMN_WIDTH + 10, height - 10);
            text_path("Click on a control to map the selected Live parameter");
            fill();
        }
    }
}

function getParameterValueText(control) {
    if (control.is_quantized) {
        return control.value_items[Math.round(control.value * (control.value_items.length - 1))];
    } else {
        var actualValue = control.min + (control.max - control.min) * control.value;
        return actualValue.toFixed(2) + (control.unit ? " " + control.unit : "");
    }
}

function wrapText(text, maxWidth) {
    var words = text.split(' ');
    var lines = [];
    var currentLine = words[0];

    for (var i = 1; i < words.length; i++) {
        var word = words[i];
        var width = mgraphics.text_measure(currentLine + " " + word)[0];
        if (width < maxWidth) {
            currentLine += " " + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines;
}

function onclick(x, y) {
    var index = Math.floor((x - LEFT_COLUMN_WIDTH - COLUMN_SPACING) / (FADER_WIDTH + FADER_SPACING));
    
    // Check if map button is clicked
    if (x > COLUMN_SPACING + BUTTON_PADDING && x < LEFT_COLUMN_WIDTH - COLUMN_SPACING - BUTTON_PADDING && y > height - 30 && y < height - 5) {
        toggleMappingMode();
    } else if (mapping && !observing) {
        if (index >= 0 && index < FADER_COUNT) {
            mappingTarget = index;
            startObserving();
        }
    } else {
        if (index >= 0 && index < FADER_COUNT) {
            focusedIndex = index;
            isDragging = true;
            updateSliderValue(index, y);
        }
    }
    
    mgraphics.redraw();
}

function ondrag(x, y) {
    if (isDragging && focusedIndex !== -1) {
        updateSliderValue(focusedIndex, y);
    }
}

function onidleout() {
    isDragging = false;
}

function onmousemove(x, y) {
    var newHoverIndex = Math.floor((x - LEFT_COLUMN_WIDTH - COLUMN_SPACING) / (FADER_WIDTH + FADER_SPACING));
    
    if (newHoverIndex !== hoverIndex) {
        hoverIndex = newHoverIndex;
        mgraphics.redraw();
    }
}

function onmouseidle() {
    if (hoverIndex !== -1) {
        hoverIndex = -1;
        mgraphics.redraw();
    }
}

function updateSliderValue(index, y) {
    if (index >= 0 && index < FADER_COUNT) {
        var faderHeight = height - COLUMN_SPACING * 2;
        var newValue = 1 - ((y - COLUMN_SPACING) / faderHeight);
        newValue = Math.max(0, Math.min(1, newValue));
        
        if (controls[index].value !== newValue) {
            controls[index].value = newValue;
            updateDeviceParameter(index, newValue);
        }
    }
    mgraphics.redraw();
}

function updateDeviceParameter(index, value) {
    if (!live_api) {
        log("Live API not initialized. Cannot update parameter.");
        return;
    }
    if (controls[index].param_id) {
        try {
            log("Attempting to update parameter with ID: " + controls[index].param_id);
            var param_api = new LiveAPI(null, controls[index].param_id);
            log("Parameter API object created for update");
            
            var min = controls[index].min;
            var max = controls[index].max;
            var scaled_value = min + (max - min) * value;
            
            param_api.set("value", scaled_value);
            log("Set value " + scaled_value + " for parameter " + controls[index].name);
            
            // Verify the update
            var new_value = parseFloat(param_api.get("value"));
            log("Verified new value: " + new_value);
            
            // Send the updated value back to the live.numbox
            outlet(0, "live.numbox[" + (index + 1) + "]", Math.round(value * 127));
            
        } catch (error) {
            log("Error updating device parameter: " + error.message);
            log("Error occurred with param_id: " + controls[index].param_id);
        }
    } else {
        log("No param_id found for control at index " + index);
    }
}

function toggleMappingMode() {
    log("toggleMappingMode called");
    if (!view_api) {
        log("View API not initialized. Cannot toggle mapping mode.");
        return;
    }

    mapping = !mapping;
    mappingTarget = -1;
    observing = false;
    
    log("Mapping mode " + (mapping ? "activated" : "deactivated"));
    
    if (!mapping) {
        stopObserving();
    }
    
    mgraphics.redraw();
}

function startObserving() {
    if (!view_api) {
        log("View API not initialized. Cannot start observing.");
        return;
    }

    try {
        view_api.property = "selected_parameter";
        observing = true;
        log("Started observing selected_parameter");
    } catch (error) {
        log("Error starting observation: " + error.message);
    }
}

function stopObserving() {
    if (!view_api) {
        log("View API not initialized. Cannot stop observing.");
        return;
    }

    try {
        view_api.property = "";
        observing = false;
        log("Stopped observing selected_parameter");
    } catch (error) {
        log("Error stopping observation: " + error.message);
    }
}

function isValidParameterId(id, number) {
    return id === "id" && number !== "0";
}

function live_callback(args) {
    log("Live callback received: " + args.join(", "));
    
    if (mapping && observing && mappingTarget !== -1) {
        if (args[0] === "selected_parameter") {
            var id = args[1];
            var number = args[2];
            log("Selected parameter ID: " + id + " " + number + " (types: " + typeof id + ", " + typeof number + ")");
            
            if (isValidParameterId(id, number)) {
                mapParameter(id, number);
            } else {
                log("Invalid parameter ID received: " + id + " " + number);
            }
        }
    }
}

function mapParameter(id, number) {
    if (!live_api) {
        log("Live API not initialized. Cannot map parameter.");
        return;
    }

    try {
        var full_id = id + " " + number;
        log("Attempting to map parameter with ID: " + full_id);
        var param_api = new LiveAPI(null, full_id);
        log("Parameter API object created");
        
        var param_name = param_api.get("name");
        log("Retrieved parameter name: " + param_name);
        
        var param_value = parseFloat(param_api.get("value"));
        log("Retrieved parameter value: " + param_value);
        
        var min = parseFloat(param_api.get("min"));
        var max = parseFloat(param_api.get("max"));
        log("Parameter range: " + min + " to " + max);
        
        // Get additional information
        var display_name = param_name;
        var device_name = "";
        var track_name = "";
        
        try {
            param_api.goto("canonical_parent");
            device_name = param_api.get("name");
            log("Retrieved device name: " + device_name);
            
            param_api.goto("canonical_parent");
            track_name = param_api.get("name");
            log("Retrieved track name: " + track_name);
            
            // Navigate back to the parameter
            param_api.goto("devices");
            param_api.goto("parameters");
            param_api.id = full_id;
        } catch (error) {
            log("Error retrieving additional information: " + error.message);
        }
        
        if (track_name && device_name) {
            display_name = track_name + " | " + device_name + " | " + param_name;
        } else if (device_name) {
            display_name = device_name + " | " + param_name;
        } else if (track_name) {
            display_name = track_name + " | " + param_name;
        }
        
        if (mappingTarget < controls.length) {
            controls[mappingTarget].param_id = full_id;
            controls[mappingTarget].name = display_name;
            controls[mappingTarget].min = min;
            controls[mappingTarget].max = max;
            controls[mappingTarget].is_quantized = param_api.get("is_quantized");
            controls[mappingTarget].value_items = param_api.get("value_items");
            controls[mappingTarget].unit = param_api.get("unit");
            controls[mappingTarget].value = (param_value - min) / (max - min);
            
            log("Control " + mappingTarget + " mapped to " + display_name + " (ID: " + full_id + ") with value " + param_value);
            
            // Exit mapping mode after successful mapping
            mapping = false;
            mappingTarget = -1;
            stopObserving();
            log("Mapping completed and mode deactivated");
            mgraphics.redraw();
        }
    } catch (error) {
        log("Error mapping parameter: " + error.message);
        log("Error occurred with param_id: " + full_id);
    }
}

function bang() {
    updateDeviceParameters();
}

function onresize(w, h) {
    updateDimensions();
}

function anything() {
    var args = arrayfromargs(arguments);
    log("Received message: " + args.join(" "));

    if (args[0] === "0" && (args[1] === "0" || args[1] === "1")) {
        midiMappingMode = args[1] === "1";
        log("MIDI mapping mode: " + (midiMappingMode ? "ON" : "OFF"));
        updateNumboxVisibility(midiMappingMode);
    } else if (args.length >= 2 && !isNaN(args[0]) && !isNaN(args[1])) {
        var index = parseInt(args[0]) - 1;
        var value = parseFloat(args[1]) / 127; // Convert 0-127 to 0-1
        log("Updating fader " + (index + 1) + " with value " + value);
        updateFaderFromNumbox(index, value);
    } else {
        log("Unhandled message: " + args.join(" "));
    }
}

function updateNumboxVisibility(show) {
    for (var i = 1; i <= FADER_COUNT; i++) {
        var message = "script sendbox live.numbox[" + i + "] hidden " + (show ? 0 : 1);
        messnamed("thispatcher", message);
        log("Sent visibility message: " + message);
    }
}

function updateFaderFromNumbox(index, value) {
    log("updateFaderFromNumbox called with index " + index + " and value " + value);
    if (index >= 0 && index < FADER_COUNT) {
        controls[index].value = value;
        updateDeviceParameter(index, value);
        mgraphics.redraw();
        log("Fader " + (index + 1) + " updated to " + value);
    } else {
        log("Invalid fader index: " + index);
    }
}


initializeScript();


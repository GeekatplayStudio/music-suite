import { app } from "/scripts/app.js";

app.registerExtension({
    name: "Geekatplay.SonicHolodeck.Mic.V3.Clean",
    async nodeCreated(node, app) {
        // Only run for our specific node
        if (node.comfyClass === "SonicMicrophoneV3") {
            try {
                const WIDGET_NAME = "Microphone";

                // --- 1. Robust Widget Cleanup (Previous Runs) ---
                node.setSize([320, 220]); // Enlarge for button

                // Wait for a frame to ensure ComfyUI has populated default widgets
                setTimeout(() => {
                    // Safety: Check if widgets exist
                    if (!node.widgets) {
                         // Node might be loading still?
                         console.warn("SonicMicrophoneV3: No widgets found on startup.");
                         return; // Can't do anything
                    }

                    // A. Hide the Audio Data Input (String)
                    const dataWidget = node.widgets.find(w => w.name === "audio_data");
                    if (dataWidget) {
                        dataWidget.type = "hidden";
                        dataWidget.computeSize = () => [0, -4];
                    }

                    // B. Prevent Duplicate Mic Selector
                    const existing = node.widgets.find(w => w.name === WIDGET_NAME);
                    if (existing) {
                         // Already initialized?
                         return;
                    }

                    // --- 2. Create the Dropdown ---
                    // FIX: LiteGraph requires { values: [] } in options object
                    const deviceWidget = node.addWidget("combo", WIDGET_NAME, "Scanning...", (v) => {
                        console.log("Mic Selected:", v);
                    }, { values: ["Scanning..."] });

                    // --- 2.1 Timer Widget ---
                    const timerWidget = node.addWidget("text", "Status", "READY", () => {}, { serialize: false });
                    if(timerWidget && timerWidget.inputEl) {
                        timerWidget.inputEl.disabled = true;
                        timerWidget.inputEl.style.textAlign = "center";
                    }

                    // --- 2.2 Recording State & Logic ---
                    const S = {
                        recording: false,
                        recorder: null,
                        chunks: [],
                        timerId: null,
                        startTime: 0,
                        maxDuration: 10.0
                    };

                    async function startRecording() {
                        if (S.recording) return;

                        // Get latest duration from input (default 10)
                        const durWidget = node.widgets.find(w => w.name === "duration_seconds");
                        S.maxDuration = durWidget ? durWidget.value : 10.0;

                        try {
                            const label = deviceWidget.value;
                            // Find device ID
                            const devices = await navigator.mediaDevices.enumerateDevices();
                            const dev = devices.find(d => (d.label || d.deviceId) === label);

                            const constraints = {
                                audio: dev ? { deviceId: { exact: dev.deviceId } } : true
                            };

                            const stream = await navigator.mediaDevices.getUserMedia(constraints);
                            S.recorder = new MediaRecorder(stream);
                            S.chunks = [];
                            S.startTime = Date.now();

                            S.recorder.ondataavailable = e => S.chunks.push(e.data);
                            S.recorder.onstop = () => {
                                const blob = new Blob(S.chunks, { type: S.recorder.mimeType });
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                    if(dataWidget) dataWidget.value = reader.result;
                                    const finalDur = ((Date.now() - S.startTime)/1000).toFixed(1);
                                    timerWidget.value = `Done: ${finalDur}s`;
                                };
                                reader.readAsDataURL(blob);

                                // Clean up tracks
                                stream.getTracks().forEach(t => t.stop());
                                S.recording = false;
                                clearInterval(S.timerId);
                                node.setDirtyCanvas(true);
                                window.removeEventListener("mouseup", globalMouseUp);
                            };

                            S.recorder.start();
                            S.recording = true;
                            node.setDirtyCanvas(true);
                            window.addEventListener("mouseup", globalMouseUp); // Catch release outside

                            // Countdown Timer
                            timerWidget.value = "RECORDING...";
                            S.timerId = setInterval(() => {
                                const elapsed = (Date.now() - S.startTime) / 1000;
                                const left = Math.max(0, S.maxDuration - elapsed);
                                const leftStr = left.toFixed(1);

                                // Update Status Text
                                timerWidget.value = `Rec: ${leftStr}s`;

                                // Update Button Text (High Visibility)
                                if (typeof btn !== "undefined") {
                                    btn.innerText = `REC: ${leftStr}s (Auto-Stop in ${leftStr})`;
                                }

                                if (left <= 0) {
                                    stopRecording(); // Auto-stop
                                }
                            }, 100);

                        } catch (e) {
                            console.error("Mic Start Error", e);
                            timerWidget.value = "Error: " + e.message;
                        }
                    }

                    function stopRecording() {
                        if (S.recording && S.recorder) {
                            S.recorder.stop();
                            // Reset UI immediately (handles auto-stop case)
                             if (typeof btn !== "undefined") {
                                 btn.style.backgroundColor = "#800";
                                 btn.style.color = "#FFF";
                                 btn.innerText = "PRESS & HOLD TO RECORD";
                             }
                        }
                    }

                    function globalMouseUp() {
                        if (S.recording) stopRecording();
                    }


                    // --- 2.3 Native DOM Button (Overlay) ---
                    // Custom Canvas widgets are failing hit-tests. We use a DOM overlay instead.
                    const btn = document.createElement("button");
                    btn.innerText = "PRESS & HOLD TO RECORD";
                    Object.assign(btn.style, {
                        width: "100%",
                        height: "50px",
                        fontSize: "14px",
                        fontWeight: "bold",
                        cursor: "pointer",
                        backgroundColor: "#800",
                        color: "white",
                        border: "1px solid white",
                        marginTop: "10px",
                        borderRadius: "8px"
                    });

                    // Add to DOM via widget system
                    // We wrap it in a LiteGraph DOM widget container
                    const domWidget = node.addDOMWidget("record_btn", "btn", btn, {
                        serialize: false,
                        hideOnZoom: false
                    });

                    // Manual events
                    const start = (e) => {
                         e.preventDefault();
                         e.stopPropagation();
                         if(!S.recording) {
                             startRecording();
                             btn.style.backgroundColor = "#0F0";
                             btn.style.color = "#000";
                             btn.innerText = "RECORDING... (RELEASE TO STOP)";
                         }
                    };

                    const stop = (e) => {
                         e.preventDefault();
                         e.stopPropagation();
                         // Just call logic, UI handled inside
                         if(S.recording) {
                             stopRecording();
                         }
                    };

                    btn.addEventListener("mousedown", start);
                    btn.addEventListener("mouseup", stop);
                    btn.addEventListener("mouseleave", stop); // Safety if drag out

                    // Also support Touch for tablets
                    btn.addEventListener("touchstart", start);
                    btn.addEventListener("touchend", stop);

                    // --- 2.4 Cleanup on Node Removal ---
                    const cleanup = () => {
                        try {
                            window.removeEventListener("mouseup", globalMouseUp);
                            btn.removeEventListener("mousedown", start);
                            btn.removeEventListener("mouseup", stop);
                            btn.removeEventListener("mouseleave", stop);
                            btn.removeEventListener("touchstart", start);
                            btn.removeEventListener("touchend", stop);

                            if (S.timerId) {
                                clearInterval(S.timerId);
                                S.timerId = null;
                            }

                            if (S.recording && S.recorder) {
                                try {
                                    S.recorder.stop();
                                } catch (e) {
                                    // Ignore recorder stop errors during cleanup
                                }
                            }

                            if (domWidget && domWidget.element) {
                                domWidget.element.remove();
                            } else if (btn && btn.parentElement) {
                                btn.parentElement.remove();
                            }
                        } catch (e) {
                            console.warn("SonicMicrophoneV3 cleanup error:", e);
                        }
                    };

                    const originalOnRemoved = node.onRemoved;
                    node.onRemoved = function () {
                        cleanup();
                        if (originalOnRemoved) {
                            return originalOnRemoved.apply(this, arguments);
                        }
                    };


                    // --- 3. Internal Scan Function ---
                    const doScan = async () => {
                        try {
                            if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
                                deviceWidget.options.values = ["Error: No HTTPS"];
                                deviceWidget.value = "Error: No HTTPS";
                                return;
                            }

                            // Ask permission
                            await navigator.mediaDevices.getUserMedia({ audio: true });

                            // Enumerate
                            const devices = await navigator.mediaDevices.enumerateDevices();
                            const audioDevs = devices.filter(d => d.kind === 'audioinput');
                            const labels = audioDevs.map(d => d.label || "Mic " + d.deviceId.slice(0,4));

                            if (labels.length > 0) {
                                deviceWidget.options.values = labels;
                                deviceWidget.value = labels[0];
                            } else {
                                deviceWidget.options.values = ["No Mics Found"];
                                deviceWidget.value = "No Mics Found";
                            }
                            node.setDirtyCanvas(true); // Redraw
                        } catch (e) {
                            console.error("SonicMicV3 Scan Error:", e);
                            deviceWidget.options.values = ["Permission/Sys Error"];
                            deviceWidget.value = "Permission/Sys Error";
                        }
                    };

                    doScan();

                }, 100); // Small 100ms delay to be safe

            } catch (err) {
                 console.error("SonicMicV3 GLOBAL CRASH:", err);
            }
        }
    }
});

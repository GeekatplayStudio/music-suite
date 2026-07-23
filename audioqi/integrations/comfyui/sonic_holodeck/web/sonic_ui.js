import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

app.registerExtension({
	name: "Geekatplay.SonicHolodeck.UI",
	async nodeCreated(node, app) {
		if (node.comfyClass === "SonicSaver") {
            // Force minimum width for the audio player
            if (node.size[0] < 300) {
                node.setSize([300, node.size[1]]);
            }

            // Create the Audio Widget
			const widget = {
				type: "AUDIO_PLAYER",
				name: "audio_player",
                // Internal state
                domElement: null,
                audioEl: null,

				draw(y, step, ctx) {
                    // We don't draw on canvas, we use the DOM overlay.
                    // But we reserve vertical space.
                    const height = 60;
                    return y + height;
				},
				computeSize(width) {
					return [width, 60];
				},
                onRemove() {
                    if (this.domElement) {
                        this.domElement.remove();
                    }
                }
			};

            // Custom logic to manage the DOM element overlay
            // This 'updatePosition' logic syncs the DOM element to the Canvas Node
            widget.updatePosition = function() {
                if (!this.domElement) return;

                // If node is collapsed or off-screenish logic (simplified)
                if (node.flags.collapsed) {
                    this.domElement.style.display = "none";
                    return;
                }

                const transform = app.canvas.ds.scale;
                const pos = app.canvas.convertPosToDOM([node.pos[0], node.pos[1]]);

                // The widget starts after inputs/outputs.
                // We'll pin it to the bottom of the node for consistency.
                const nodeWidth = node.size[0] * transform;
                const nodeHeight = node.size[1] * transform;

                // Calculate position relative to node bottom
                // We want it INSIDE the node at the bottom, or just appended.
                // Let's float it at the bottom of the node area.

                this.domElement.style.position = "absolute";
                this.domElement.style.left = (pos[0]) + "px";
                this.domElement.style.top = (pos[1] + nodeHeight) + "px"; // Append below node
                this.domElement.style.width = (nodeWidth) + "px";
                this.domElement.style.zIndex = 100;
                this.domElement.style.display = "flex";
            }

            // Create DOM
            const div = document.createElement("div");
            div.style.display = "none"; // Hidden until updated
            div.style.flexDirection = "column";
            div.style.backgroundColor = "#222";
            div.style.border = "1px solid #444";
            div.style.borderTop = "none";
            div.style.borderRadius = "0 0 10px 10px";
            div.style.padding = "10px";
            div.style.boxSizing = "border-box";

            const audio = document.createElement("audio");
            audio.controls = true;
            audio.style.width = "100%";
            audio.style.marginBottom = "5px";

            const statusLabel = document.createElement("div");
            statusLabel.innerText = "No Audio";
            statusLabel.style.color = "#888";
            statusLabel.style.fontSize = "12px";
            statusLabel.style.textAlign = "center";

            div.appendChild(statusLabel);
            div.appendChild(audio);

            document.body.appendChild(div);

            widget.domElement = div;
            widget.audioEl = audio;
            widget.statusLabel = statusLabel;

			node.addCustomWidget(widget);

            // Hook into the draw loop to update DOM position
            const onDraw = node.onDraw;
			node.onDraw = function (ctx) {
				const r = onDraw ? onDraw.apply(this, arguments) : undefined;
                widget.updatePosition();
				return r;
			};

            // Hook into execution to get the audio file
            const onExecuted = node.onExecuted;
            node.onExecuted = function(message) {
                if (onExecuted) onExecuted.apply(this, arguments);

                if (message && message.audio && message.audio.length > 0) {
                    const item = message.audio[0];
                    const filename = item.filename;
                    const subfolder = item.subfolder;
                    const type = item.type;

                    const params = new URLSearchParams({
                        filename,
                        subfolder,
                        type
                    });

                    // Force refresh with timestamp
                    const url = api.apiURL(`/view?${params}`) + `&t=${Date.now()}`;

                    widget.audioEl.src = url;
                    widget.statusLabel.innerText = filename;
                    widget.statusLabel.style.color = "#4fce4f"; // Green for success

                    // Auto play
                    widget.audioEl.play().catch(e => console.log("Autoplay blocked:", e));
                }
            };
		}
	},
});

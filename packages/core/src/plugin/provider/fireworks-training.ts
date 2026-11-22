import type { Fireworks } from "@opencode/schema/fireworks"

/** Build a literal Python configuration; user values never become shell or Python source. */
export function trainingScript(input: Fireworks.Training, logPath: string) {
  const encoded = Buffer.from(JSON.stringify({ ...input, logPath })).toString("base64")

  return `# AlphaAi by AAi — Fireworks Serverless SFT. No credentials are saved here.
import base64, datetime, json, os, pathlib, sys

if sys.version_info < (3, 11):
    raise SystemExit("Install Python 3.11 or newer.")
cfg = json.loads(base64.b64decode("${encoded}"))
if not os.environ.get("FIREWORKS_API_KEY"):
    raise SystemExit("Connect a Fireworks API key in AAi.")
free = cfg["baseModel"] == "accounts/fireworks/models/muse-glimmer-30b" and datetime.datetime.now(datetime.timezone.utc) < datetime.datetime(2026, 12, 1, 8, tzinfo=datetime.timezone.utc)
if not free and not cfg["allowPaid"]:
    raise SystemExit("This run is outside the Muse Glimmer SFT promotion. Review current pricing and explicitly allow paid training.")
dataset = pathlib.Path(cfg["dataset"])
if not dataset.is_file():
    raise SystemExit("Training dataset must be a local chat JSONL file.")
rows = 0
with dataset.open(encoding="utf-8-sig") as stream:
    for line_number, line in enumerate(stream, 1):
        if not line.strip():
            continue
        row = json.loads(line)
        messages = row.get("messages") if isinstance(row, dict) else None
        if not isinstance(messages, list) or not messages or not all(isinstance(m, dict) and m.get("role") in ("system", "user", "assistant", "tool") for m in messages) or not any(m.get("role") == "assistant" and (m.get("content") or m.get("tool_calls")) for m in messages):
            raise SystemExit(f"Invalid chat training row {line_number}: expected messages with an assistant response.")
        rows += 1
if not rows:
    raise SystemExit("Dataset is empty.")
try:
    from training.recipes.sft_loop import Config, main
except ImportError:
    raise SystemExit('Install the official training SDK: python -m pip install "fireworks-ai[training]==1.2.31" "fireworks-training-cookbook==2026.11.5.1"')
print(f"AlphaAi: {rows} training examples; serverless LoRA SFT; sampling evaluation disabled.", flush=True)
main(Config(
    log_path=cfg["logPath"], dataset=str(dataset.resolve()),
    base_model=cfg["baseModel"], tokenizer_model=cfg["tokenizer"], renderer_name=cfg["renderer"],
    epochs=cfg["epochs"], batch_size=cfg["batchSize"], max_seq_len=cfg["maxSeqLen"], output_model_id=cfg["outputModel"],
    learning_rate=cfg["learningRate"], lora_rank=cfg["loraRank"],
    serverless=True, close_session_on_exit=True, save_final_checkpoint=True,
    dcp_save_interval=50, tokenizer_trust_remote_code=False,
))
print("AlphaAi: training complete. Check the model inventory; deploy before selecting a trained model for chat.", flush=True)
`
}

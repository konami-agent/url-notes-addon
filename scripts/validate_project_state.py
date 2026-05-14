#!/usr/bin/env python3
import json
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
required = ["PROJECT.md", "TASKS.json", "PROGRESS.md", "cron_prompt.md", "scripts/validate_project_state.py"]
errors = []
warnings = []
for rel in required:
    if not (root / rel).exists():
        errors.append(f"missing required file: {rel}")
try:
    data = json.loads((root / "TASKS.json").read_text(encoding="utf-8"))
except Exception as exc:
    errors.append(f"cannot read TASKS.json: {exc}")
    data = None
if data:
    tasks = data.get("tasks")
    if not isinstance(tasks, list) or not tasks:
        errors.append("TASKS.json must contain a non-empty tasks list")
        tasks = []
    ids = set()
    for i, task in enumerate(tasks):
        tid = task.get("id")
        if not tid:
            errors.append(f"task[{i}] missing id")
            continue
        if tid in ids:
            errors.append(f"duplicate task id: {tid}")
        ids.add(tid)
        status = task.get("status")
        if status not in {"pending", "ready", "in_progress", "completed", "blocked", "cancelled"}:
            errors.append(f"task {tid} has invalid status: {status}")
        for field in ["title", "priority", "dependencies", "deliverables", "acceptance_criteria", "evidence", "attempts"]:
            if field not in task:
                errors.append(f"task {tid} missing field: {field}")
    for task in tasks:
        tid = task.get("id")
        for dep in task.get("dependencies", []):
            if dep not in ids:
                errors.append(f"task {tid} depends on unknown task: {dep}")
    for task in tasks:
        if task.get("status") == "completed" and not task.get("evidence"):
            warnings.append(f"completed task {task.get('id')} has no evidence")
print(f"Project: {root}")
print(f"Tasks: {len(data.get('tasks', [])) if data else 0}")
print(f"Errors: {len(errors)}")
for e in errors:
    print(f"ERROR: {e}")
print(f"Warnings: {len(warnings)}")
for w in warnings:
    print(f"WARNING: {w}")
if errors:
    sys.exit(1)
print("OK")

from fastapi import WebSocket
from typing import Dict
import json

class ConnectionManager:
    def __init__(self):
        self.active: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active[client_id] = websocket

    def disconnect(self, client_id: str):
        self.active.pop(client_id, None)

    async def broadcast(self, message: str):
        dead = []
        for cid, ws in self.active.items():
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(cid)
        for cid in dead:
            self.active.pop(cid, None)

    async def send_event(self, event_type: str, data: dict):
        await self.broadcast(json.dumps({"type": event_type, "data": data}))

manager = ConnectionManager()

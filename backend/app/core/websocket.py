"""
WebSocket Connection Manager
Handles real-time bidirectional communication with connected clients
"""

import json
import logging
from typing import Dict, List, Set
from fastapi import WebSocket, WebSocketDisconnect
from datetime import datetime

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Manages WebSocket connections and broadcasts messages to connected clients.
    Supports real-time updates for meetings, CRM tasks, content uploads, and notifications.
    """

    def __init__(self):
        """Initialize the connection manager with an empty set of active connections."""
        self.active_connections: Set[WebSocket] = set()
        self._connection_metadata: Dict[WebSocket, dict] = {}
        logger.info("WebSocket ConnectionManager initialized")

    async def connect(self, websocket: WebSocket, user_email: str = None):
        """
        Accept and register a new WebSocket connection.

        Args:
            websocket: The WebSocket connection to register
            user_email: Optional email of the authenticated user
        """
        await websocket.accept()
        self.active_connections.add(websocket)

        # Store metadata about the connection
        self._connection_metadata[websocket] = {
            "user_email": user_email,
            "connected_at": datetime.utcnow().isoformat(),
        }

        logger.info(
            f"WebSocket connected - Total connections: {len(self.active_connections)}, "
            f"User: {user_email or 'anonymous'}"
        )

    def disconnect(self, websocket: WebSocket):
        """
        Unregister a WebSocket connection.

        Args:
            websocket: The WebSocket connection to remove
        """
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            metadata = self._connection_metadata.pop(websocket, {})
            user_email = metadata.get("user_email", "anonymous")

            logger.info(
                f"WebSocket disconnected - Total connections: {len(self.active_connections)}, "
                f"User: {user_email}"
            )

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """
        Send a message to a specific WebSocket connection.

        Args:
            message: Dictionary to send as JSON
            websocket: Target WebSocket connection
        """
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Error sending personal message: {e}")
            self.disconnect(websocket)

    async def broadcast(self, message: dict):
        """
        Broadcast a message to all connected WebSocket clients.

        Args:
            message: Dictionary to broadcast as JSON to all clients
        """
        if not self.active_connections:
            logger.debug("No active WebSocket connections to broadcast to")
            return

        disconnected = []

        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except WebSocketDisconnect:
                disconnected.append(connection)
                logger.warning("WebSocket disconnected during broadcast")
            except Exception as e:
                disconnected.append(connection)
                logger.error(f"Error broadcasting to WebSocket: {e}")

        # Clean up disconnected clients
        for connection in disconnected:
            self.disconnect(connection)

        logger.info(
            f"Broadcasted message type '{message.get('type', 'unknown')}' "
            f"to {len(self.active_connections)} clients"
        )

    async def broadcast_notification(
        self,
        notification_type: str,
        data: dict,
        title: str = None,
        message: str = None
    ):
        """
        Broadcast a structured notification to all connected clients.

        Args:
            notification_type: Type of notification (MEETING_SCHEDULED, CRM_TASK_ASSIGNED, etc.)
            data: Additional data payload for the notification
            title: Optional notification title
            message: Optional notification message
        """
        notification = {
            "type": notification_type,
            "data": data,
            "timestamp": datetime.utcnow().isoformat(),
        }

        if title:
            notification["title"] = title
        if message:
            notification["message"] = message

        await self.broadcast(notification)

    def get_active_connection_count(self) -> int:
        """
        Get the number of active WebSocket connections.

        Returns:
            Count of active connections
        """
        return len(self.active_connections)

    def get_connection_info(self) -> List[dict]:
        """
        Get information about all active connections.

        Returns:
            List of dictionaries containing connection metadata
        """
        return [
            {
                "user_email": metadata.get("user_email", "anonymous"),
                "connected_at": metadata.get("connected_at"),
            }
            for metadata in self._connection_metadata.values()
        ]


# Global connection manager instance
manager = ConnectionManager()

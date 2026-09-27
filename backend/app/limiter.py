"""Per-route request limits.

Local-only product: slowapi's in-memory per-route limits keyed by the immediate
client address. Revisit shared storage and proxy-aware keys before any hosted
multi-user launch.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

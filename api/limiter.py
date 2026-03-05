"""Rate limiter para proteção contra brute force e abuso."""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

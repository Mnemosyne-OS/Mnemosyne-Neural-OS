#!/bin/sh
# Usage: unshare -n tests/netns_lo_up.sh <commande...>
# Active l'interface lo dans un espace réseau isolé (sans accès externe), puis exécute la commande.
python3 - <<'PY'
import socket, fcntl, struct
SIOCGIFFLAGS, SIOCSIFFLAGS, IFF_UP = 0x8913, 0x8914, 0x1
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
ifr = struct.pack('16sH', b'lo', 0)
flags = struct.unpack('16sH', fcntl.ioctl(s, SIOCGIFFLAGS, ifr))[1]
fcntl.ioctl(s, SIOCSIFFLAGS, struct.pack('16sH', b'lo', flags | IFF_UP))
PY
exec "$@"

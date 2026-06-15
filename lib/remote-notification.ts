import type { SessionState } from '@/lib/session';

export function getRemoteSessionNotification(
  current: SessionState,
  remote: SessionState,
): string | null {
  const currentPlayers = new Map(current.players.map((player) => [player.id, player]));

  for (const player of remote.players) {
    const previous = currentPlayers.get(player.id);
    if (!previous) {
      return `เพิ่ม ${player.name} เข้ารอบจากอีกเครื่อง`;
    }
    if (!previous.paid && player.paid) {
      return `${player.name} จ่ายแล้ว ${player.paidAmount ?? 0} บาท จากอีกเครื่อง`;
    }
    if (previous.paid && !player.paid) {
      return `ย้าย ${player.name} กลับไปค้างจ่ายจากอีกเครื่อง`;
    }
  }

  for (const player of current.players) {
    if (!remote.players.some((candidate) => candidate.id === player.id)) {
      return `ลบ ${player.name} ออกจากรอบจากอีกเครื่อง`;
    }
  }

  if (remote.currentShuttleNumber > current.currentShuttleNumber) {
    return `ยืนยัน Match ลูก ${remote.currentShuttleNumber - 1} จากอีกเครื่อง`;
  }

  return null;
}

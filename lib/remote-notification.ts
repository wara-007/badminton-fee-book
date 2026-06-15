import type { SessionState } from '@/lib/session';

export function getRemoteSessionNotification(
  current: SessionState,
  remote: SessionState,
): string | null {
  const currentPlayers = new Map(current.players.map((player) => [player.id, player]));
  const paidPlayers: string[] = [];
  const unpaidPlayers: string[] = [];

  for (const player of remote.players) {
    const previous = currentPlayers.get(player.id);
    if (!previous) {
      return `เพิ่ม ${player.name} เข้ารอบจากอีกเครื่อง`;
    }
    if (!previous.paid && player.paid) {
      paidPlayers.push(`${player.name} ${player.paidAmount ?? 0} บาท`);
    }
    if (previous.paid && !player.paid) {
      unpaidPlayers.push(player.name);
    }
  }

  if (paidPlayers.length > 0) {
    return paidPlayers.length === 1
      ? `${paidPlayers[0].replace(/ (\d+(?:\.\d+)?) บาท$/, " จ่ายแล้ว $1 บาท")} จากอีกเครื่อง`
      : `จ่ายแล้ว ${paidPlayers.length} คน: ${paidPlayers.join(", ")} จากอีกเครื่อง`;
  }
  if (unpaidPlayers.length > 0) {
    return unpaidPlayers.length === 1
      ? `ย้าย ${unpaidPlayers[0]} กลับไปค้างจ่ายจากอีกเครื่อง`
      : `ย้ายกลับค้างจ่าย ${unpaidPlayers.length} คน: ${unpaidPlayers.join(", ")} จากอีกเครื่อง`;
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

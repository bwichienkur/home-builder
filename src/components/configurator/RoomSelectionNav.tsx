import { useMemo } from 'react';
import { usePlannerStore } from '../../store/plannerStore';
import { useConfiguratorStore } from '../../store/configuratorStore';
import { computeProjectRollup } from '../../lib/configurator/roomRollups';
import { useBuildCatalog } from '../../store/catalogStore';
import { useInventoryStore } from '../../store/inventoryStore';

export function RoomSelectionNav() {
  const project = useConfiguratorStore((s) => s.project);
  const role = useConfiguratorStore((s) => s.role);
  const activeRoomFilter = useConfiguratorStore((s) => s.activeRoomFilter);
  const setActiveRoomFilter = useConfiguratorStore((s) => s.setActiveRoomFilter);
  const planRooms = usePlannerStore((s) => s.planRooms);
  const enterRoom = usePlannerStore((s) => s.enterRoom);
  const exitRoom = usePlannerStore((s) => s.exitRoom);
  const furniture = usePlannerStore((s) => s.furniture);
  const inventory = useInventoryStore((s) => s.items);
  const catalog = useBuildCatalog(inventory);

  const rollup = useMemo(() => {
    if (!project?.contract) return null;
    return computeProjectRollup({
      catalog,
      contract: project.contract,
      furniture,
      planRooms,
      takeoff: project.takeoff,
      allowances: project.allowances,
      levelOverrides: project.levelOverrides,
      role,
    });
  }, [project, catalog, furniture, planRooms, role]);

  if (!project) return null;

  const rooms = planRooms.length
    ? planRooms.map((r) => r.name || r.roomType || 'Room')
    : ['Kitchen', 'Master Bath', 'Living', 'Bedroom'];

  return (
    <nav className="room-selection-nav" aria-label="Room selections">
      <button
        type="button"
        className={!activeRoomFilter ? 'active' : ''}
        onClick={() => {
          setActiveRoomFilter(null);
          exitRoom();
        }}
      >
        <span>All rooms</span>
        {rollup && <small>${rollup.jobDelta.toLocaleString()}</small>}
      </button>
      {rooms.map((room) => {
        const total = rollup?.roomTotals.find((r) => r.roomName === room)?.delta ?? 0;
        const planRoom = planRooms.find((r) => r.name === room);
        return (
          <button
            key={room}
            type="button"
            className={activeRoomFilter === room ? 'active' : ''}
            onClick={() => {
              setActiveRoomFilter(room);
              if (planRoom) enterRoom(planRoom.id);
            }}
          >
            <span>{room}</span>
            {role !== 'client' && (
              <small className={total > 0 ? 'is-upgrade' : total < 0 ? 'is-credit' : ''}>
                {total >= 0 ? '+' : ''}${total.toLocaleString()}
              </small>
            )}
          </button>
        );
      })}
    </nav>
  );
}

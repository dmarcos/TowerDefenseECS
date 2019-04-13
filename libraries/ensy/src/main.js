//
// App Boilerplate
//

const THREE = require("three");
const EntityManager = require("ensy");
const App = require("../../common/app.js");

const APP = new App(update);

//
// ECS Setup
//

const manager = new EntityManager();

//
// Components
//

manager.addComponent("Velocity", {
  state: {
    x: 0,
    y: 0,
    z: 0
  }
});

manager.addComponent("Gravity", {
  state: {
    force: -9.8
  }
});

manager.addComponent("Mesh", {
  state: {
    mesh: null
  }
});

manager.addComponent("Collider", {
  state: {
    collider: null,
    collided: null
  }
});

manager.addComponent("Explosive", {
  state: {
    destructible: true,
    explodes: null
  }
});

manager.addComponent("ToRemove", { state: {} });

manager.addComponent("Enemy", { state: {} });

manager.addComponent("Projectile", { state: {} });

manager.addComponent("Turret", {
  state: {
    firingRate: 1 / 2,
    timeUntilFire: 2
  }
});

manager.addComponent("Vehicle", {
  state: {
    speed: 1,
    onboard: null
  }
});

manager.addComponent("Collector", {
  state: {
    rate: 20
  }
});

//
// Processors
//

class Processor {
  constructor(manager) {
    this.manager = manager;
  }
}

function update(delta) {
  manager.update(delta);
}

class GravityProcessor extends Processor {
  update(delta) {
    const entities = this.manager.entityComponentData["Gravity"];
    for (const entityId in entities) {
      this.manager.entityComponentData["Velocity"][entityId].y += entities[entityId].force * delta;
    }
  }
}

class VelocityProcessor extends Processor {
  update(delta) {
    const entities = this.manager.entityComponentData["Velocity"];
    for (const entityId in entities) {
      const mesh = this.manager.entityComponentData["Mesh"][entityId];
      if (!mesh) continue;
      mesh.mesh.position.x += entities[entityId].x * delta;
      mesh.mesh.position.y += entities[entityId].y * delta;
      mesh.mesh.position.z += entities[entityId].z * delta;
    }
  }
}

class CollisionProcessor extends Processor {
  constructor(entities) {
    super(entities);
    this.tempBox1 = new THREE.Box3();
    this.tempBox2 = new THREE.Box3();
  }
  update() {
    const entities = this.manager.entityComponentData["Collider"];
    if (!entities) return;
    const entityIds = Object.keys(entities);
    for (const entityId in entities) {
      entities[entityId].collided = null;
    }
    for (let i = 0; i < entityIds.length; i++) {
      const e1 = entityIds[i];
      const e1c = entities[e1];
      const e1m = this.manager.entityComponentData["Mesh"][e1].mesh;
      e1m.updateMatrixWorld();
      APP.updateBox(this.tempBox1, e1c.collider, e1m.matrixWorld);
      for (let j = i + 1; j < entityIds.length; j++) {
        const e2 = entityIds[j];
        const e2c = entities[e2];
        const e2m = this.manager.entityComponentData["Mesh"][e2].mesh;
        e2m.updateMatrixWorld();
        APP.updateBox(this.tempBox2, e2c.collider, e2m.matrixWorld);
        if (!this.tempBox1.intersectsBox(this.tempBox2)) continue;
        e1c.collided = e2;
        e2c.collided = e1;
      }
    }
  }
}

class ExplosiveProcessor extends Processor {
  update() {
    const entities = this.manager.entityComponentData["Explosive"];
    for (const entityId in entities) {
      const { collided } = this.manager.entityComponentData["Collider"][entityId];
      const explosiveBelowFloor = this.manager.entityComponentData["Mesh"][entityId].mesh.position.y <= -0.5;
      const shouldExplodeCollided =
        collided &&
        (this.manager.entityHasComponent(collided, entities[entityId].explodes) ||
          entities[entityId].explodes === null);
      if (explosiveBelowFloor || (shouldExplodeCollided && entities[entityId].destructible)) {
        this.manager.addComponentsToEntity(["ToRemove"], entityId);
      }
      if (shouldExplodeCollided) {
        this.manager.addComponentsToEntity(["ToRemove"], collided);
      }
    }
  }
}

class OnboardRemover extends Processor {
  update() {
    const entities = this.manager.entityComponentData["Vehicle"];
    for (const entityId in entities) {
      if (this.manager.entityHasComponent(entityId, "ToRemove")) {
        this.manager.addComponentsToEntity(["ToRemove"], entities[entityId].onboard);
      }
    }
  }
}

class MeshRemover extends Processor {
  constructor(manager) {
    super(manager);
    this._entitiesToRemove = [];
  }
  update() {
    this._entitiesToRemove.length = 0;
    const entities = this.manager.entityComponentData["ToRemove"];
    for (const entityId in entities) {
      this._entitiesToRemove.push(entityId);
    }
    for (const entityId of this._entitiesToRemove) {
      const mesh = this.manager.entityComponentData["Mesh"][entityId].mesh;
      mesh.parent.remove(mesh);
      this.manager.removeEntity(entityId);
    }
  }
}

class ResourceProcessor extends Processor {
  constructor(manager) {
    super(manager);
    this.power = 150;
  }
  update(delta) {
    const entities = this.manager.entityComponentData["Collector"];
    for (const entityId in entities) {
      this.power += entities[entityId].rate * delta;
    }
    APP.updatePower(this.power);
  }
}

class PlacementProcessor extends Processor {
  constructor(manager, resourceProcessor) {
    super(manager);
    this.resourceProcessor = resourceProcessor;
    this.worldPosition = new THREE.Vector3();
    this.factories = {
      mine: createMine,
      turret: createTurret,
      vehicle: createTurretVehicle,
      collector: createCollector
    };
    APP.onCreate = (itemName, cost) => {
      this.updatePlacement();
      if (!APP.placementValid) return;
      let item = this.factories[itemName]();
      this.resourceProcessor.power -= cost;
      this.manager.entityComponentData["Mesh"][item].mesh.position.copy(APP.placeholder.position);
    };
  }
  update() {
    this.updatePlacement();
  }
  updatePlacement() {
    const intersection = APP.getIntersection();
    if (!intersection) {
      APP.updatePlacement(false);
      return;
    }
    const entities = this.manager.entityComponentData["Mesh"];
    const [x, z] = [Math.round(intersection.point.x), Math.round(intersection.point.z)];
    let placementValid = !APP.currentItem.input.disabled;
    for (const entityId in entities) {
      entities[entityId].mesh.getWorldPosition(this.worldPosition);
      const [ex, ez] = [Math.round(this.worldPosition.x), Math.round(this.worldPosition.z)];
      if (!this.manager.entityHasComponent(entityId, "Projectile") && x === ex && z === ez) {
        placementValid = false;
      }
    }
    APP.updatePlacement(placementValid, x, z);
  }
}

class TurretProcessor extends Processor {
  update(delta) {
    const entities = this.manager.entityComponentData["Turret"];
    for (const entityId in entities) {
      entities[entityId].timeUntilFire -= delta;
      if (entities[entityId].timeUntilFire <= 0) {
        const projectile = createProjectile();
        const projectileMesh = this.manager.entityComponentData["Mesh"][projectile];
        this.manager.entityComponentData["Mesh"][entityId].mesh.getWorldPosition(projectileMesh.mesh.position);
        entities[entityId].timeUntilFire = 1 / entities[entityId].firingRate;
      }
    }
  }
}

class VehicleProcessor extends Processor {
  update(delta) {
    const entities = this.manager.entityComponentData["Vehicle"];
    for (const entityId in entities) {
      const { position } = this.manager.entityComponentData["Mesh"][entityId].mesh;
      if (Math.abs(position.x) >= 2) {
        position.x = Math.sign(position.x) * 2;
        entities[entityId].speed *= -1;
      }
      position.x += entities[entityId].speed * delta;
    }
  }
}

class EnemyWaveProcessor extends Processor {
  constructor(manager) {
    super(manager);
    this.elapsed = 0;
    this.currentWave = APP.waves[0];
  }
  update(delta) {
    this.elapsed += delta;
    const currentWave = APP.getCurrentWave(this.elapsed);
    if (currentWave === this.currentWave) return;
    this.currentWave = currentWave;
    this.generateWave(currentWave);
  }
  generateWave(wave) {
    if (!wave) return;
    const occupied = {};
    for (let i = 0; i < wave.enemies; i++) {
      const enemy = createEnemy();
      const lane = THREE.Math.randInt(-2, 2);
      const mesh = this.manager.entityComponentData["Mesh"][enemy].mesh;
      mesh.position.x = lane;
      occupied[lane] = occupied[lane] === undefined ? 0 : occupied[lane] - 2;
      mesh.position.z = occupied[lane] - 5;
    }
  }
}

class GameOverProcessor extends Processor {
  constructor(manager, enemyWaveProcessor) {
    super(manager);
    this.enemyWaveProcessor = enemyWaveProcessor;
    this.tempBox = new THREE.Box3();
    this.collider = new THREE.Box3();
    this.collider.setFromCenterAndSize(new THREE.Vector3(0, 0, 6), new THREE.Vector3(5, 1, 1));
  }
  update() {
    const entities = this.manager.entityComponentData["Enemy"];
    if (!entities) return;
    if (!Object.keys(entities).length && !this.enemyWaveProcessor.currentWave) {
      APP.stopPlaying("You Win!");
      return;
    }
    for (const entityId in entities) {
      APP.updateBox(
        this.tempBox,
        this.manager.entityComponentData["Collider"][entityId].collider,
        this.manager.entityComponentData["Mesh"][entityId].mesh.matrixWorld
      );
      if (this.tempBox.intersectsBox(this.collider)) {
        APP.stopPlaying("Game Over");
        break;
      }
    }
  }
}

manager.addProcessor(new GravityProcessor(manager));
manager.addProcessor(new VelocityProcessor(manager));
manager.addProcessor(new CollisionProcessor(manager));
manager.addProcessor(new ExplosiveProcessor(manager));
manager.addProcessor(new OnboardRemover(manager));
manager.addProcessor(new MeshRemover(manager));
const resourceProcessor = new ResourceProcessor(manager);
manager.addProcessor(resourceProcessor);
manager.addProcessor(new PlacementProcessor(manager, resourceProcessor));
manager.addProcessor(new TurretProcessor(manager));
manager.addProcessor(new VehicleProcessor(manager));
const enemyWaveProcessor = new EnemyWaveProcessor(manager);
manager.addProcessor(enemyWaveProcessor);
if (!APP.perfMode) {
  manager.addProcessor(new GameOverProcessor(manager, enemyWaveProcessor));
}

//
// Entity factories
//

function createEnemy() {
  const entityId = manager.createEntity(["Enemy", "Mesh", "Velocity", "Collider", "Explosive"]);
  const mesh = APP.createBox("green");
  manager.entityComponentData["Mesh"][entityId].mesh = mesh;
  manager.entityComponentData["Velocity"][entityId].z = 1.5;
  manager.entityComponentData["Collider"][entityId].collider = new THREE.Box3().setFromObject(mesh);
  manager.entityComponentData["Explosive"][entityId].destructible = false;
  APP.scene.add(mesh);
  return entityId;
}

function createMine() {
  const entityId = manager.createEntity(["Mesh", "Collider", "Explosive"]);
  const mesh = APP.createBox("red");
  manager.entityComponentData["Mesh"][entityId].mesh = mesh;
  manager.entityComponentData["Collider"][entityId].collider = new THREE.Box3().setFromObject(mesh);
  manager.entityComponentData["Explosive"][entityId].explodes = "Enemy";
  APP.scene.add(mesh);
  return entityId;
}

function createProjectile() {
  const entityId = manager.createEntity(["Projectile", "Mesh", "Velocity", "Gravity", "Explosive", "Collider"]);
  const mesh = APP.createBox("red", 0.2);
  manager.entityComponentData["Mesh"][entityId].mesh = mesh;
  manager.entityComponentData["Collider"][entityId].collider = new THREE.Box3().setFromObject(mesh);
  manager.entityComponentData["Explosive"][entityId].explodes = "Enemy";
  manager.entityComponentData["Velocity"][entityId].z = -20.0;
  APP.scene.add(mesh);
  return entityId;
}

function createTurret(withCollider = true, firingRate) {
  const entityId = manager.createEntity(["Turret", "Mesh"]);
  if (firingRate) {
    manager.entityComponentData["Turret"][entityId].firingRate = firingRate;
    manager.entityComponentData["Turret"][entityId].timeUntilFire = 1 / firingRate;
  }
  const mesh = APP.createBox("blue");
  manager.entityComponentData["Mesh"][entityId].mesh = mesh;
  if (withCollider) {
    manager.addComponentsToEntity(["Collider"], entityId);
    manager.entityComponentData["Collider"][entityId].collider = new THREE.Box3().setFromObject(mesh);
  }
  APP.scene.add(mesh);
  return entityId;
}

function createTurretVehicle() {
  const entityId = manager.createEntity(["Vehicle", "Mesh", "Collider"]);
  const mesh = APP.createBox("yellow", 0.9);
  manager.entityComponentData["Mesh"][entityId].mesh = mesh;
  manager.entityComponentData["Collider"][entityId].collider = new THREE.Box3().setFromObject(mesh);
  const turret = createTurret(false, 1);
  const turretMesh = manager.entityComponentData["Mesh"][turret].mesh;
  turretMesh.position.y = 0.5;
  mesh.add(turretMesh);
  manager.entityComponentData["Vehicle"][entityId].onboard = turret;
  APP.scene.add(mesh);
  return entityId;
}

function createCollector() {
  const entityId = manager.createEntity(["Collector", "Mesh", "Collider"]);
  const mesh = APP.createBox("orange");
  manager.entityComponentData["Mesh"][entityId].mesh = mesh;
  manager.entityComponentData["Collider"][entityId].collider = new THREE.Box3().setFromObject(mesh);
  APP.scene.add(mesh);
  return entityId;
}

if (APP.perfMode) {
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 4; j++) {
      const turret = createTurretVehicle();
      manager.entityComponentData["Mesh"][turret].mesh.position.set(i - 2, 0, j + 2);
    }
  }
}
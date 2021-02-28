import * as THREE from '../../build/three.module.js';
import { OrbitControls } from '../jsm/controls/OrbitControls.js';
import * as CANNON from '../dist/cannon-es.js'
import { OBJLoader } from '../jsm/loaders/OBJLoader.js';
import { MTLLoader } from '../jsm/loaders/MTLLoader.js';
import cannonDebugger from '../dist/cannon-es-debugger.js'


//Sterowanie
//W ; A ; S ; D  + B (hamulce)

//Koła słabo sterują gdy pojazd przyspiesza (ustawienia zawieszenia)

//Dla siebie komentarze pisałem po angielsku, więc są trochę pomieszane

//##############MY SWITCHES##########
const cameraLock = true;

//drugi tryb kamery, nalezy wylaczyc camera lock
const cameraLockRotation = false;

//ograniczenie mapy pudełkiem 1000*1000
const loadBoundingPlanes = false;

//reflektory
const carLightsOn = false;

//mgła
const fogEnabled = false;

//##############GAME "LOGIC"##############
let activeCheckpoint = 0;
let totalCheckpoints = 0;
let Checkpoints = [];

class Checkpoint {
    constructor(posx, posy, posz, radius, quat) {
        this.active = false;
        this.radius = radius;
        this.vector = new THREE.Vector3(posx, posy, posz);
        const geometry = new THREE.TorusGeometry(radius, radius / 8, 8, 32);
        this.torus = new THREE.Mesh(geometry, Checkpoint.checkpointMaterial);
        this.torus.position.x = posx;
        this.torus.position.y = posy;
        this.torus.position.z = posz;
        this.torus.quaternion.copy(quat)
        this.torus.visible = false;
        scene.add(this.torus);
    }

    static checkpointMaterial = new THREE.MeshPhongMaterial({
        color: 0xffff00,
        opacity: 0.5,
        transparent: true,
    });
    activate() {
        this.active = true;
        this.torus.visible = true;
    }

    deactivate() {
        this.active = false;
        this.torus.visible = false;
    }
}


//########THREE Variables#########

let camera, scene, renderer, controls, helper;
const clock = new THREE.Clock();
let brickTexture;

//Globalne światła
const ambientLightIntenisty = 0.8;
const directionalLightIntensity = 0.8;


//dla synchronizacji pozycji nadwozia
const quaternion = new THREE.Quaternion(0, 0, 0, 1);
const rotationQuaternion = new THREE.Quaternion();
rotationQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);

const basePlaneWidth = 1000;
const basePlaneLength = 1000;
let box;
let carMesh = new THREE.Object3D();
let wheelsMesh = [];
let frontLeftWheelMesh = new THREE.Object3D();
let frontRightWheelMesh = new THREE.Object3D();
let rearLeftWheelMesh = new THREE.Object3D();
let rearRightWheelMesh = new THREE.Object3D();

//Dla synchronizacji pozycji kół
let rotationQuatNeg = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI/2,0 ))
let rotationQuatPos = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, +Math.PI/2,0 ))

//dla aktualizowania pozycji kamery
let oldCarPosition = [];
let oldCarRotation;

//Kolekcje do aktualizacji pozycji pachołków
let coneMeshMap = new Map();
let coneBodyMap = new Map();

//obiekty baseMesh są do klonowania, baseShape do określania geometrii ciał CANNON
//inicjalizowane są w funkcjach np. initCone()
let baseConeMesh;
let coneTextureURI;
let frontLeftLamp;
let frontLeftLampTarget;
let frontRightLamp;
let frontRightLampTarget;
let coneBaseShape;
let baseRampMesh;
let baseRampShape;
let baseCardboardShape;
let baseCardboardMesh;

//Kolekcje do aktualizacji pozycji pudełek
let boxBodyMap = new Map();
let boxMeshMap = new Map();


//########Cannon Variables########

let baseConeShape;
let world;
let body;
//Materiały definiują interakcje między ciałami CANNON
let physicsMaterial;
let vehicle;
let groundMaterial;
let chassisMaterial;

//Tick dla jednego wywołania aktualizacji świata CANNON
const timeStep = 1 / 60;

const baseGroundFriction = 0.4;
const baseGroundRestitution = 0.01;
const carMass = 20; //default 1
const worldGravity = 10;

//Opcje zawieszenia
const wheelOptions = {
    radius: 0.4, //default 0.5
    directionLocal: new CANNON.Vec3(0, -1, 0),
    suspensionStiffness: 30, //default 30
    suspensionRestLength: 0.3,
    frictionSlip: 1.4, //default 1.4
    dampingRelaxation: 2.3,
    dampingCompression: 10, //default 4.4
    maxSuspensionForce: 100000,
    rollInfluence: 0.01,
    axleLocal: new CANNON.Vec3(0, 0, 1),
    chassisConnectionPointLocal: new CANNON.Vec3(-1, 0, 1),
    maxSuspensionTravel: 0.5, //default 0.3
    customSlidingRotationalSpeed: -30,
    useCustomSlidingRotationalSpeed: true,
}
const wheelBodies = []

//################################
//Podstawowe funkcje (są też inne wmieszane w init i initCannon)
initCone();
initCannon();
init();

//Generuje w scenie wiremeshe dla Shape
//(zawartych w Body, dodanych do world) CANNONA (domyślnie nie są widoczne w scenie)
//cannonDebugger(scene, world.bodies);

animate();
//#############LISTENERS#################


document.addEventListener('keydown', (event) => {

    
    const maxSteerVal = 0.6;
    //Te zmienne definiują nadawane kołom momenty
    const maxForce = 120 //default 1000
    const brakeForce = 2

    switch (event.key) {
        case 'w':
            vehicle.applyEngineForce(-maxForce, 2) //(siła ,index koła)
            vehicle.applyEngineForce(-maxForce, 3)
            break

        case 's':
            vehicle.applyEngineForce(maxForce, 2)
            vehicle.applyEngineForce(maxForce, 3)
            break

        case 'a':
            vehicle.setSteeringValue(maxSteerVal, 0)
            vehicle.setSteeringValue(maxSteerVal, 1)
            break

        case 'd':
            vehicle.setSteeringValue(-maxSteerVal, 0)
            vehicle.setSteeringValue(-maxSteerVal, 1)
            break

        case 'b':
            vehicle.setBrake(brakeForce, 0)
            vehicle.setBrake(brakeForce, 1)
            vehicle.setBrake(brakeForce, 2)
            vehicle.setBrake(brakeForce, 3)
            break
    }
})

document.addEventListener('keyup', (event) => {
    switch (event.key) {
        case 'w':
            vehicle.applyEngineForce(0, 2)
            vehicle.applyEngineForce(0, 3)
            break

        case 's':
            vehicle.applyEngineForce(0, 2)
            vehicle.applyEngineForce(0, 3)
            break

        case 'a':
            vehicle.setSteeringValue(0, 0)
            vehicle.setSteeringValue(0, 1)
            break

        case 'd':
            vehicle.setSteeringValue(0, 0)
            vehicle.setSteeringValue(0, 1)
            break

        case 'b':
            vehicle.setBrake(0, 0)
            vehicle.setBrake(0, 1)
            vehicle.setBrake(0, 2)
            vehicle.setBrake(0, 3)
            break
    }
})


//####### 	DEFINICJE FUNKCJI		#################


//wyłączona
function addSkydome() {
    var img = new THREE.TextureLoader().load("image/sky2.png");
    img.repeat.set(2, 0.8);
    //img.rotation = 0.1;
    img.wrapS = THREE.RepeatWrapping;
    img.wrapT = THREE.RepeatWrapping;
    //img.flipY = true;
    var skyboxMaterial = new THREE.MeshBasicMaterial({
        map: img,
        depthWrite: false,
        side: THREE.BackSide,
    });
    var skybox = new THREE.Mesh(
        new THREE.SphereGeometry(2048, 32, 32),
        skyboxMaterial
    );
    scene.add(skybox);
}

//Tło sceny (obraz360)
function addBackground() {
    const loader = new THREE.TextureLoader();
    const texture = loader.load(
        'image/quarry_02.jpg',
        () => {
            const rt = new THREE.WebGLCubeRenderTarget(texture.image.height);
            rt.fromEquirectangularTexture(renderer, texture);
            scene.background = rt;
        });
}

//Widoczna płaszczyzna
function addGround() {
    const groundTexture = new THREE.TextureLoader().load('image/Asphalt-042-seamFilter.jpg')
    groundTexture.wrapS = THREE.RepeatWrapping;
    groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.anisotropy = 16;
    groundTexture.repeat.set(basePlaneWidth / 25, basePlaneLength / 25);
    const material = new THREE.MeshLambertMaterial({ map: groundTexture }) //color:0x44aa44
    const floorGeometry = new THREE.PlaneBufferGeometry(basePlaneWidth, basePlaneLength, 100, 100)
    floorGeometry.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeometry, material);
    floor.position.y -= 10;
    floor.castShadow = false;
    floor.receiveShadow = true;
    scene.add(floor);
}

//Fizyczna płaszczyzna
function addGroundCannon() {
    physicsMaterial = new CANNON.Material('physics')
    //definicja oddziaływania między ciałami o tym materiale
    groundMaterial = new CANNON.ContactMaterial(physicsMaterial, physicsMaterial, {
        friction: baseGroundFriction,
        restitution: baseGroundRestitution,
        contactEquationStiffness: 1e6 //'sprężystość' interakcji
    })
    world.addContactMaterial(groundMaterial)

    const groundShape = new CANNON.Plane();
    //masa 0 daje obiekt statyczny(immovable)
    const groundBody = new CANNON.Body({ mass: 0, material: physicsMaterial })
    groundBody.addShape(groundShape)
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
    groundBody.position.set(0, -10, 0)
    world.addBody(groundBody)
}

//Pudełko wokół mapy
function addMapBoundingPlanes() {
    //Planes are buggy
    //const mapBoundingShape = new CANNON.Plane();
    const mapBoundingShape = new CANNON.Box(new CANNON.Vec3(basePlaneWidth / 2, basePlaneLength / 2, 20));
    for (var i = 0; i < 5; i++) {
        const mapBoundingBody = new CANNON.Body({ mass: 0, material: physicsMaterial })
        mapBoundingBody.addShape(mapBoundingShape)
        switch (i) {
            //+x axis
            case 0:
                mapBoundingBody.position.set(basePlaneWidth / 2, 0, 0);
                mapBoundingBody.quaternion.setFromEuler(0, Math.PI / 2, 0) //Math.Pi/2
                break;
            //-x axis
            case 1:
                mapBoundingBody.position.set(-basePlaneWidth / 2, 0, 0);
                mapBoundingBody.quaternion.setFromEuler(0, Math.PI / 2, 0)
                break;
            //+z axis
            case 2:
                mapBoundingBody.position.set(0, 0, basePlaneLength / 2);
                mapBoundingBody.quaternion.setFromEuler(0, 0, 0)
                break;
            //-z axis
            case 3:
                mapBoundingBody.position.set(0, 0, -basePlaneLength / 2);
                mapBoundingBody.quaternion.setFromEuler(0, 0, 0)
                break;
            //Ceiling
            case 4:
                mapBoundingBody.position.set(0, 50, 0);
                mapBoundingBody.quaternion.setFromEuler(Math.PI / 2, 0, 0)
                break;
        }
        world.addBody(mapBoundingBody);
    }
}


//############################   CAR   ###########################

//Koła i nadwozie ładowane są z osobnych plików
//Ta funkcja jest dla obiektu THREE
function loadCarMesh() {
    var manager = new THREE.LoadingManager();
    var mtlLoader = new MTLLoader(manager);
    mtlLoader.load('models/a-volvo-duet-no-Wheels.mtl', function (materials) {
        var objLoader = new OBJLoader(manager);
        objLoader.setMaterials(materials);
        objLoader.load('models/a-volvo-duet-no-Wheels.obj', function (loaded) {
            carMesh.add(loaded);
            scene.add(carMesh);
        })
    });
    carMesh.receiveShadow = true;
    carMesh.castShadow = true;

    //front Left
    manager = new THREE.LoadingManager();
    mtlLoader = new MTLLoader(manager);
        mtlLoader.load('models/volvo-front-tire.mtl', function (materials) {
        var objLoader = new OBJLoader(manager);
        objLoader.setMaterials(materials);
        objLoader.load('models/volvo-front-tire.obj', function (loaded) {
            frontLeftWheelMesh.add(loaded)
            scene.add(frontLeftWheelMesh); 
        })
    });

    //front right
    manager = new THREE.LoadingManager();
    mtlLoader = new MTLLoader(manager);
        mtlLoader.load('models/volvo-front-tire.mtl', function (materials) {
        var objLoader = new OBJLoader(manager);
        objLoader.setMaterials(materials);
        objLoader.load('models/volvo-front-tire.obj', function (loaded) {
            frontRightWheelMesh.add(loaded)
            scene.add(frontRightWheelMesh);
        })
    });

    //rear left
    manager = new THREE.LoadingManager();
    mtlLoader = new MTLLoader(manager);
        mtlLoader.load('models/volvo-rear-tire.mtl', function (materials) {
        var objLoader = new OBJLoader(manager);
        objLoader.setMaterials(materials);
        objLoader.load('models/volvo-rear-tire.obj', function (loaded) {
            rearLeftWheelMesh.add(loaded)
            scene.add(rearLeftWheelMesh);
        })
    });

    //rear right
    manager = new THREE.LoadingManager();
    mtlLoader = new MTLLoader(manager);
        mtlLoader.load('models/volvo-rear-tire.mtl', function (materials) {
        var objLoader = new OBJLoader(manager);
        objLoader.setMaterials(materials);
        objLoader.load('models/volvo-rear-tire.obj', function (loaded) {
            rearRightWheelMesh.add(loaded)
            scene.add(rearRightWheelMesh);
        })
    });




    //Przednie lampy
    if (carLightsOn) {

        frontLeftLamp = new THREE.SpotLight(0xffff55, 2, 100, Math.PI / 2, 1); //color : Integer, intensity : Float, distance : Float, angle : Radians, penumbra : Float, decay : Float
        frontLeftLamp.shadow = true;
        frontLeftLamp.position.clone(carMesh.position);
        frontLeftLamp.position.z -= 2;
        frontLeftLamp.position.x -= 1;

        frontLeftLampTarget = new THREE.Points();
        frontLeftLampTarget.position.clone(carMesh.position);
        frontLeftLampTarget.position.z -= 10;
        frontLeftLampTarget.position.x -= 1;

        frontLeftLamp.target = frontLeftLampTarget;
        carMesh.add(frontLeftLampTarget);
        carMesh.add(frontLeftLamp);

        frontRightLamp = new THREE.SpotLight(0xffff55, 2, 100, Math.PI / 2, 1); //color : Integer, intensity : Float, distance : Float, angle : Radians, penumbra : Float, decay : Float
        frontRightLamp.shadow = true;
        frontRightLamp.position.clone(carMesh.position);
        frontRightLamp.position.z -= 2;
        frontRightLamp.position.x += 1;

        frontRightLampTarget = new THREE.Points();
        frontRightLampTarget.position.clone(carMesh.position);
        frontRightLampTarget.position.z -= 10;
        frontRightLampTarget.position.x += 1;

        frontRightLamp.target = frontRightLampTarget;
        carMesh.add(frontRightLampTarget);
        carMesh.add(frontRightLamp);
    }
}

//Ta funkcja jest dla inicjalizacji ciała CANNON
function loadCarPhysics() {
    //Nadwozie składane jest z paru 'klocków' 
    //(Nie mogłem wyciągnąć punktów i ścian z nadwozia THREE + nie jest ono w pełni wypukłe)
    const chassisShape = new CANNON.Box(new CANNON.Vec3(0.9, 0.5, 1)) //1,1,2.5 hood
    const chassisShape2 = new CANNON.Box(new CANNON.Vec3(0.8, 1, 1.2)) //cab
    const chassisShape3 = new CANNON.Box(new CANNON.Vec3(0.6, 0.3, 1.2)) //back
    chassisMaterial = new CANNON.Material('chassis');
    const chassisBody = new CANNON.Body({ mass: carMass, material: chassisMaterial })
    
    //Vec3 w tej metodzie to offset dla umieszczania Shape w Body
    chassisBody.addShape(chassisShape, new CANNON.Vec3(-1.35, -0.2, 0)) //hood 
    chassisBody.addShape(chassisShape2, new CANNON.Vec3(0.2, 0.2, 0)) //cab
    chassisBody.addShape(chassisShape3, new CANNON.Vec3(1.6, -0.4, 0)) //back
    chassisBody.position.set(0, -8, 0)
    body = chassisBody;

    //Gotowa klasa CANNON dla pojazdów
    vehicle = new CANNON.RaycastVehicle({
        chassisBody,
    })
    //Front Left
    wheelOptions.chassisConnectionPointLocal.set(-1.25, -0.5, 1); //-2,-0.75,1
    vehicle.addWheel(wheelOptions);

    //Front right
    wheelOptions.chassisConnectionPointLocal.set(-1.25, -0.5, -1);
    vehicle.addWheel(wheelOptions);

    //opcje dla tylnich kół

    wheelOptions.frictionSlip = 1.2;
    wheelOptions.maxSuspensionTravel = 0.4;
    wheelOptions.radius = 0.45;
    wheelOptions.isFrontWheel = false;
    //Rear left
    wheelOptions.chassisConnectionPointLocal.set(1.65, -0.5, 1);
    vehicle.addWheel(wheelOptions);

    //Rear right
    wheelOptions.chassisConnectionPointLocal.set(1.65, -0.5, -1);
    vehicle.addWheel(wheelOptions);

    vehicle.addToWorld(world);

    //Definicje ciał kół
    const wheelMaterial = new CANNON.Material('wheel')
    vehicle.wheelInfos.forEach((wheel) => {
        let cylinderHeight = wheel.radius;
        if (wheel.isFrontWheel) {
            cylinderHeight /= 2;
        }
        const cylinderShape = new CANNON.Cylinder(wheel.radius, wheel.radius, cylinderHeight, 40) //default 20 segments
        const wheelBody = new CANNON.Body({
            mass: 0,
            material: wheelMaterial,
        })
        wheelBody.type = CANNON.Body.KINEMATIC
        wheelBody.collisionFilterGroup = 0 // turn off collisions
        const quaternion = new CANNON.Quaternion().setFromEuler(-Math.PI / 2, 0, 0)
        wheelBody.addShape(cylinderShape, new CANNON.Vec3(), quaternion)
        wheelBodies.push(wheelBody)
        world.addBody(wheelBody)
    })

    //Definicja kontaktu kół z otoczeniem
    const wheel_ground = new CANNON.ContactMaterial(wheelMaterial, physicsMaterial, {
        friction: 0.3,
        restitution: 0,
        contactEquationStiffness: 1000,
    })
    world.addContactMaterial(wheel_ground)

    //Definicja kontaktu nadwozia z otoczeniem
    const chassis_ground = new CANNON.ContactMaterial(chassisMaterial, physicsMaterial, {
        friction: 0.05,
        restitution: 0,
        contactEquationStiffness: 1e6,
    })
    world.addContactMaterial(chassis_ground)
}

//inicjalizacja świata Cannon
function initCannon() {
    world = new CANNON.World();
    world.gravity.set(0, -worldGravity, 0);

    //Bardziej precyzyjne obliczenia kosztem wydajności
    world.solver.iterations = 100;
    addGroundCannon();
    if (loadBoundingPlanes) {
        addMapBoundingPlanes();
    }
    loadCarPhysics();
    // Sweep and prune broadphase
    world.broadphase = new CANNON.SAPBroadphase(world)
    // Disable friction by default
    world.defaultContactMaterial.friction = 0
}


//#######################MAKING CONES#####################

//Inicjalizacja zmiennych THREE i CANNON do kopiowania przez tworzone pachołki 
function initCone() {
    const geometry = new THREE.ConeGeometry(0.25, 0.8, 16);
    let material;
    if (coneTextureURI == null) //niedokończone
        material = new THREE.MeshBasicMaterial({ color: 0xaa4444 });
    else { }
    //load texture
    let baseGeometry = new THREE.BoxGeometry(0.6,0.1,0.6);
    let baseMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    let baseMesh = new THREE.Mesh(baseGeometry,baseMaterial);
    
    baseMesh.position.y-=0.4;


    const cone = new THREE.Mesh(geometry, material);
    cone.add(baseMesh);
    baseConeMesh = cone;

    //odpowiednia forma punktów i ścian dla konstruktora ConvexPolyhedron
    const vertices = []
    for (let j = 0; j < cone.geometry.vertices.length; j += 1) {
        vertices.push(new CANNON.Vec3(cone.geometry.vertices[j].x, cone.geometry.vertices[j].y, cone.geometry.vertices[j].z))
    }

    const faces = []
    for (let j = 0; j < cone.geometry.faces.length; j += 1) {
        faces.push([cone.geometry.faces[j].a, cone.geometry.faces[j].b, cone.geometry.faces[j].c])
    }

    //Convex Polyhedron jest limitowany dla wypukłych kształtów. Jest też najbardziej skomplikowanym obiektem CANNONA (chyba...)
    baseConeShape = new CANNON.ConvexPolyhedron({ vertices, faces });//Conical shape
    coneBaseShape = new CANNON.Box(new CANNON.Vec3(0.3,0.05 , 0.3)); //Shape for the base. Confusing, i know.
    
}

//Tworzenie nowych pachołków, name musi być unikalne
// (mogło także być w tablicy, bez name)
//Nie obracam ich
function spawnNewCone(name, posx, posy, posz) {
    const coneBody = new CANNON.Body({ mass: 0.2, material: physicsMaterial });
    const cone = baseConeMesh.clone();
    coneBody.addShape(baseConeShape);
    coneBody.addShape(coneBaseShape,new CANNON.Vec3(0,-0.4,0))
    coneBody.quaternion.setFromEuler(0, 0, 0)
    coneBody.position.x = posx;
    coneBody.position.y = posy;
    coneBody.position.z = posz;
    
    //coneBody.castShadow = true;
    cone.castShadow=true;

    //Dodaję obiekty THREE i ciała CANNON do kolekcji dla późniejszej aktualizacji
    coneMeshMap.set(name, cone);
    coneBodyMap.set(name, coneBody);
    world.addBody(coneBody);
    scene.add(cone);
}

//#################### RAMPS ###################

//Z rysunku w zeszycie, punkty i ściany
function initRamp(scale){
    const verticesOfRamp = [
        -2,-1,-2,    2,-1,-2,    2, -1,2,    -2, -1,2,
        -2,1, -2,    2,1, -2,    
    ];
    
    const indicesOfFaces = [
        0,1,3,    1,2,3,
        4,0,3,    5,2,1,
        4,5,0,    5,1,0,
        4,3,5,    5,3,2
    ];

    for(let i=0;i<verticesOfRamp.length;i++){
        verticesOfRamp[i]*=scale;
    }

    //change material later

    const geometry = new THREE.PolyhedronGeometry( verticesOfRamp, indicesOfFaces, 4, 0 );
    //Kształty CANNON tworzone są po odległości od jakiegoś punktu w tej samej płaszczyźnie (chyba...)
    //więc skalowane są trochę inaczej od geometrii THREE
    geometry.scale(scale*3/4,scale*3/4,scale*3/4);
    const material = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    baseRampMesh = new THREE.Mesh(geometry,material);

    //Dla ConvexPolyhedron podobnie jak w initCone()
    const vertices = []
    for (let j = 0; j < verticesOfRamp.length; j += 3) {
        vertices.push(new CANNON.Vec3(verticesOfRamp[j], verticesOfRamp[j+1], verticesOfRamp[j+2]))
    }

    const faces = []
    for (let j = 0; j < indicesOfFaces.length; j += 3) {
        faces.push([indicesOfFaces[j], indicesOfFaces[j+1], indicesOfFaces[j+2]])
    }
    baseRampShape = new CANNON.ConvexPolyhedron({ vertices, faces });
}

//Tym razem nie ma kolekcji, bo rampy mają masę 0 i meshe nie muszą być aktualizowane
//rotacja tylko wokół osi y, bo nie są mi potrzebne odwrócone rampy
function addRamp(posx,posy,posz,roty){
    //change material later
    const newRamp = new CANNON.Body({ mass: 0, material: physicsMaterial });
    newRamp.addShape(baseRampShape);

    newRamp.quaternion.setFromEuler(0, roty, 0);
    newRamp.position.x = posx;
    newRamp.position.y = posy;
    newRamp.position.z = posz;

    const rampMesh = baseRampMesh.clone();
    rampMesh.position.copy(newRamp.position);
    rampMesh.quaternion.copy(newRamp.quaternion);

    world.addBody(newRamp);
    scene.add(rampMesh);
}

//################### Deadly Cardboard Boxes#####################

//Działanie bardzo podobne do pachołków, ale mogę tu skorzystać z
//prostej w inicjalizacji klasy CANNON.Box zamiast ComplexPolyhedron
function initCardboard(){
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    //change later
    const material = new THREE.MeshBasicMaterial({ color: 0xe1c699 });
    baseCardboardMesh = new THREE.Mesh(geometry,material);
    baseCardboardShape = new CANNON.Box(new CANNON.Vec3(0.5,0.5 , 0.5));
}

//To samo co w pachołkach
function spawnCardboard(name,posx,posy,posz){
    const boxBody = new CANNON.Body({ mass: 0.1, material: physicsMaterial });
    const boxMesh = baseCardboardMesh.clone();
    boxBody.addShape(baseCardboardShape);

    boxBody.position.x = posx;
    boxBody.position.y = posy;
    boxBody.position.z = posz;
    
    boxMesh.castShadow=true;
    boxMeshMap.set(name, boxMesh);
    boxBodyMap.set(name, boxBody);
    world.addBody(boxBody);
    scene.add(boxMesh);
}


//###################CHECKPOINT METHODS##################################


function spawnNewCheckpoint(posx, posy, posz, radius, quat) {
    let checkpoint = new Checkpoint(posx, posy, posz, radius, quat);
    Checkpoints.push(checkpoint);
    totalCheckpoints++;
}

//Zalicza checkpointy, 'kończy' grę
function checkCheckpoints() {
    if (activeCheckpoint === totalCheckpoints)
        return;

    if (body.position.distanceTo(Checkpoints[activeCheckpoint].vector) < Checkpoints[activeCheckpoint].radius) {
        Checkpoints[activeCheckpoint].deactivate();
        activeCheckpoint++;
        //nawiązanie do 'kultowej' gry Big Rigs: Over the Road Racing
        if (activeCheckpoint === totalCheckpoints)
            document.getElementsByClassName('text-block')[0].textContent = "You're Winner! Your time: " + Math.floor(clock.getElapsedTime())
        else
            Checkpoints[activeCheckpoint].activate();
    }
}

//####################### WALLS #####################

//tworzy ściany
function spawnWall(posx, posz, roty, length) {
    const boxBody = new CANNON.Body({ mass: 0, material: physicsMaterial })
    const boxShape = new CANNON.Box(new CANNON.Vec3(length / 2, 100, 2)); //y=4
    boxBody.addShape(boxShape);
    boxBody.position.x = posx;
    boxBody.position.y = -8;
    boxBody.position.z = posz;
    boxBody.quaternion.copy(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, roty, 0)));
    

   
    brickTexture.repeat.set( length/7, 1 );
    var brickMaterial = new THREE.MeshLambertMaterial({ map: brickTexture });
    var wallGeometry = new THREE.CubeGeometry(length, 6, 0.6);
    var wallMesh = new THREE.Mesh(wallGeometry, brickMaterial); //Utworzenie siatki trojkatow tworzacej skybox

    wallMesh.position.copy(boxBody.position);
    wallMesh.position.y+=1;
    wallMesh.position.z+=2;
    wallMesh.quaternion.copy(boxBody.quaternion);
    scene.add(wallMesh);
    world.addBody(boxBody);
}

function addDefaultWalls() {
    spawnWall(-300, 0, Math.PI / 2, 600);
    spawnWall(300, 0, Math.PI / 2, 600);
    spawnWall(0, 300, 0, 600);
    spawnWall(0, -300, 0, 600);
}


//##########################INIT THREE###################################

function init() {

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 20000);
    camera.position.set(0, 4, 10);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    //addSkydome();
    addBackground();
    addGround();

    var light = new THREE.AmbientLight(0x777777, ambientLightIntenisty); // swiatlo otoczenia	
    scene.add(light);

    var light1 = new THREE.DirectionalLight(0xffffff, directionalLightIntensity);
    light1.shadow = true;

    light1.position.set(-1000, 800, 0);
    scene.add(light1);

    loadCarMesh();

    initRamp(2); //(w nawiasie stała skala dla ramp)

    initCardboard();

    brickTexture = new THREE.TextureLoader().load("image/brick2-desaturated.jpg");
    brickTexture.wrapS = THREE.RepeatWrapping;
    brickTexture.wrapT = THREE.RepeatWrapping;
    addDefaultWalls();

    document.getElementsByClassName('text-block')[0].textContent = ""

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMapEnabled = true;
    renderer.shadowMapType = THREE.PCFSoftShadowMap;

    document.body.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);

    //Żeby nie schodzić poniżej głównej płaszczyzny
    controls.maxPolarAngle = Math.PI / 2; 
    controls.update();

    //Przyczep kamerę do samochodu
    if (cameraLockRotation) {
        carMesh.add(camera);
        controls.enabled = false;
        camera.position.y += 3;
        camera.position.z += 6;
    }
    if (fogEnabled) //mgła
        scene.fog = new THREE.Fog(0xbbddee, -4 * 1024, 4 * 1024);  //mgla (kolor, near, far)

    //funkcja grupująca tworzenie pudełek,pachołków i punktów kontrolnych
    spawnStuff();
    window.addEventListener('resize', onWindowResize, false);
}

function spawnStuff(){
    //posx,posy,posz,promień,obrót
    spawnNewCheckpoint(0,0,0,20,new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)))
    clock.start();
    spawnNewCheckpoint(-100, 0, 0, 5, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)));
    
    //Pierwszy checkpoint jest aktywowany ręcznie
    Checkpoints[0].activate();

    //posx,posy,posz,obrót wokół osi y
    addRamp(-80,-10,0,Math.PI/2);
    addRamp(0,-10,-80,0);

    //nazwa musi być unikalna; posx,posy,posz
    spawnNewCone('cone1', -76, -9.8, 4);
    spawnNewCone('cone2', -76, -9.8, -4);
    spawnNewCone('cone3', -74, -9.8, 4);
    spawnNewCone('cone4', -74, -9.8, -4);
    spawnNewCone('cone5', -72, -9.8, 4);
    spawnNewCone('cone6', -72, -9.8, -4);

    spawnNewCheckpoint(-100, -8, 100, 5, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI/4, 0)));
    
    //nazwa musi być unikalna; posx,posy,posz
    spawnCardboard('box1',-100,-9.8,99.9);
    spawnCardboard('box2',-100,-9.8,98.8);
    spawnCardboard('box3',-100,-9.8,97.7);
    spawnCardboard('box4',-100,-9.8,96.6);
    spawnCardboard('box5',-100,-9.8,96.5);
    spawnCardboard('box6',-100,-9.8,101);
    spawnCardboard('box7',-100,-9.8,102.1);
    spawnCardboard('box8',-100,-9.8,103.2);
    spawnCardboard('box9',-100,-9.8,104.3);
    spawnCardboard('box10',-100,-9.8,105.4);

    spawnCardboard('box11',-100,-8.7,99.9);
    spawnCardboard('box12',-100,-8.7,98.8);
    spawnCardboard('box13',-100,-8.7,97.7);
    spawnCardboard('box14',-100,-8.7,96.6);
    spawnCardboard('box15',-100,-8.7,96.5);
    spawnCardboard('box16',-100,-8.7,101);
    spawnCardboard('box17',-100,-8.7,102.1);
    spawnCardboard('box18',-100,-8.7,103.2);
    spawnCardboard('box19',-100,-8.7,104.3);
    spawnCardboard('box20',-100,-8.7,105.4);

    spawnCardboard('box21',-100,-7.6,99.9);
    spawnCardboard('box22',-100,-7.6,98.8);
    spawnCardboard('box23',-100,-7.6,97.7);
    spawnCardboard('box24',-100,-7.6,96.6);
    spawnCardboard('box25',-100,-7.6,96.5);
    spawnCardboard('box26',-100,-7.6,101);
    spawnCardboard('box27',-100,-7.6,102.1);
    spawnCardboard('box28',-100,-7.6,103.2);
    spawnCardboard('box29',-100,-7.6,104.3);
    spawnCardboard('box30',-100,-7.6,105.4);

    spawnNewCheckpoint(100, -8, 100, 5, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI/2, 0)));
    spawnNewCheckpoint(0, -6, 0, 10, new THREE.Quaternion().setFromEuler(new THREE.Euler(0,Math.PI/2, 0)));
    spawnNewCheckpoint(-120, 10, 0, 15, new THREE.Quaternion().setFromEuler(new THREE.Euler(0,Math.PI/2, 0)));
    
}


function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

}
//##########################
function animate() {
    requestAnimationFrame(animate);

    //Dla różnicy pozycji do aktualizacji kamery
    oldCarPosition[0] = carMesh.position.x;
    oldCarPosition[1] = carMesh.position.y;
    oldCarPosition[2] = carMesh.position.z;

    checkCheckpoints();
    updatePhysics();
    if (carLightsOn) {
        frontLeftLamp.target = frontLeftLampTarget;
        frontRightLamp.target = frontRightLampTarget;
    }

    //aktualizacja pozycji kamery w trybie cameraLock
    if (cameraLock) {
        camera.position.x -= oldCarPosition[0] - carMesh.position.x;
        camera.position.y -= oldCarPosition[1] - carMesh.position.y;
        camera.position.z -= oldCarPosition[2] - carMesh.position.z;
    }
    //aktualizacja celu kamery
    if (cameraLock || cameraLockRotation) {
        controls.target.set(carMesh.position.x, carMesh.position.y, carMesh.position.z);
        controls.update();
    }

    let multiQuat = new THREE.Quaternion();//
    

    //Aktualizacja pozycji i obrotu obiektów THREE kół
    multiQuat.copy(wheelBodies[0].quaternion)
    multiQuat.multiply(rotationQuatNeg)
    frontLeftWheelMesh.position.copy(wheelBodies[0].position)
    frontLeftWheelMesh.quaternion.copy(multiQuat)

    multiQuat.copy(wheelBodies[1].quaternion)
    multiQuat.multiply(rotationQuatPos)
    frontRightWheelMesh.position.copy(wheelBodies[1].position)
    frontRightWheelMesh.quaternion.copy(multiQuat)

    multiQuat.copy(wheelBodies[2].quaternion)
    multiQuat.multiply(rotationQuatPos)
    rearLeftWheelMesh.position.copy(wheelBodies[2].position)
    rearLeftWheelMesh.quaternion.copy(multiQuat)

    multiQuat.copy(wheelBodies[3].quaternion)
    multiQuat.multiply(rotationQuatNeg)
    rearRightWheelMesh.position.copy(wheelBodies[3].position)
    rearRightWheelMesh.quaternion.copy(multiQuat)


    render();
}

function updatePhysics() {
    // Step the physics world
    world.step(timeStep)

    //update carMesh position/direction
    carMesh.position.copy(body.position)
    //center collision box to this weird model
    carMesh.translateZ(-1.6);
    
    //Rotate model to match collision box
    quaternion.copy(body.quaternion);
    quaternion.multiply(rotationQuaternion);
    carMesh.quaternion.copy(quaternion);

    //Aktualizacje pozycji i obrotu pachołków
    for (const [k, v] of coneMeshMap.entries()) {
        v.position.copy(coneBodyMap.get(k).position);
        v.quaternion.copy(coneBodyMap.get(k).quaternion);
    }

    //Aktualizacje pozycji i obrotu pudełek
    for (const [k, v] of boxMeshMap.entries()) {
        v.position.copy(boxBodyMap.get(k).position);
        v.quaternion.copy(boxBodyMap.get(k).quaternion);
    }

    //Aktualizacje ciał kół
    for (let i = 0; i < vehicle.wheelInfos.length; i++) {
        vehicle.updateWheelTransform(i)
        const transform = vehicle.wheelInfos[i].worldTransform
        const wheelBody = wheelBodies[i]
        wheelBody.position.copy(transform.position)
        wheelBody.quaternion.copy(transform.quaternion)
    }
}

//#####################################
function render() {
    renderer.render(scene, camera);
}
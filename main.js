import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// --- Variáveis Globais ---
let camera, scene, renderer;
let world;
let gameStarted = false;
let moveDirection = 1;
let score = 0;
let recorde = localStorage.getItem("stack_recorde") ? parseInt(localStorage.getItem("stack_recorde")) : 0;
let perfectStreak = 0;
let sizeBonus = 0; 
let audioCtxBackground = null;
let musicInterval = null;
const stack = [];
const overhangs = [];
const boxHeight = 1;
const originalBoxSize = 3;
const grupoPilha = 1;
const grupoFantasma = 2;

init();

function init() {
    world = new CANNON.World();
    world.gravity.set(0, -10, 0);
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 40;

    scene = new THREE.Scene(); 

    addLayer(0, 0, originalBoxSize, originalBoxSize, "x", false);
    addLayer(-10, 0, originalBoxSize, originalBoxSize, "x", true);

    const luzAmbiente = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(luzAmbiente);

    const luzDirecional = new THREE.DirectionalLight(0xffffff, 0.8);
    luzDirecional.position.set(10, 20, 15); 
    luzDirecional.castShadow = true; 
    
    luzDirecional.shadow.mapSize.width = 2048;
    luzDirecional.shadow.mapSize.height = 2048;
    luzDirecional.shadow.camera.near = 0.5;
    luzDirecional.shadow.camera.far = 100;
    
    
    const d = 10;
    luzDirecional.shadow.camera.left = -d;
    luzDirecional.shadow.camera.right = d;
    luzDirecional.shadow.camera.top = d;
    luzDirecional.shadow.camera.bottom = -d;
    
    scene.add(luzDirecional);

    const width = 10;
    const height = width * (window.innerHeight / window.innerWidth);
    
    camera = new THREE.OrthographicCamera(
        width / -2,  
        width / 2,   
        height / 2,  
        height / -2, 
        1,           
        100          
    );
    camera.position.set(4, 4, 4);
    camera.lookAt(0, 0, 0);

    document.getElementById("recordeText").innerText = "Recorde: " + recorde;

    
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; 
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; 
    document.body.appendChild(renderer.domElement);

    renderer.render(scene, camera);
}

function addLayer(x, z, width, depth, direction, falls = true) {
    const y = boxHeight * stack.length;
    const layer = generateBox(x, y, z, width, depth, falls, direction);
    layer.direction = direction;

    stack.push(layer);
}

function addOverhang(x, z, width, depth, customY = null) {
    const y = customY !== null ? customY : boxHeight * (stack.length - 1);
    const currentDirection = stack.length > 0 ? stack[stack.length - 1].direction : "x";
    const overhang = generateBox(x, y, z, width, depth, true, currentDirection); 
    overhangs.push(overhang);
}

function createRoundedBoxGeometry(width, depth) {
    const radius = 0.15; 
    const shape2D = new THREE.Shape();
    
    const w = width / 2;
    const d = depth / 2;
    shape2D.moveTo(-w + radius, -d);
    shape2D.lineTo(w - radius, -d);
    shape2D.quadraticCurveTo(w, -d, w, -d + radius);
    shape2D.lineTo(w, d - radius);
    shape2D.quadraticCurveTo(w, d, w - radius, d);
    shape2D.lineTo(-w + radius, d);
    shape2D.quadraticCurveTo(-w, d, -w, d - radius);
    shape2D.lineTo(-w, -d + radius);
    shape2D.quadraticCurveTo(-w, -d, -w + radius, -d);

    const extrudeSettings = {
        depth: boxHeight - 0.1, 
        bevelEnabled: true,
        bevelThickness: 0.05,   
        bevelSize: 0.05,        
        bevelSegments: 4,       
        curveSegments: 8        
    };

    const geometry = new THREE.ExtrudeGeometry(shape2D, extrudeSettings);
    geometry.center();
    return geometry;
}

function generateBox(x, y, z, width, depth, falls, direction) {
    if (!falls && sizeBonus > 0) {
        if (direction === "x") {
            width += sizeBonus;
        } else if (direction === "z") {
            depth += sizeBonus;
        }
    }

    const geometry = new THREE.BoxGeometry(width, boxHeight, depth);

    const hue = (30 + stack.length * 12) % 360; 
    const color = new THREE.Color(`hsl(${hue}, 95%, 60%)`);
    
    const material = new THREE.MeshToonMaterial({ 
        color: color,
        roughness: 1.0
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    
    mesh.castShadow = true;    
    mesh.receiveShadow = true; 
    scene.add(mesh);

    const outlineMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x111111, 
        side: THREE.BackSide 
    });
    const outlineMesh = new THREE.Mesh(geometry, outlineMaterial);
    
    outlineMesh.scale.set(1.03, 1.03, 1.03); 
    outlineMesh.name = "cartoonOutline"; 
    mesh.add(outlineMesh); 
    

    const shape = new CANNON.Box(
        new CANNON.Vec3(width / 2, boxHeight / 2, depth / 2)
    );
    let mass = falls ? 5 : 0;
    const body = new CANNON.Body({ mass, shape });
    body.position.set(x, y, z);


    if (falls) {
        body.collisionFilterGroup = grupoFantasma;
        body.collisionFilterMask = 0; 
    } else {
        body.collisionFilterGroup = grupoPilha;
        body.collisionFilterMask = grupoPilha;
    }

    world.addBody(body);

    return {
        threejs: mesh,
        cannonjs: body, 
        width,
        depth,
    };
}

function cutBox(topLayer, overlap, size, delta) {
    const direction = topLayer.direction;
    const newWidth = direction === "x" ? overlap : topLayer.width;
    const newDepth = direction === "z" ? overlap : topLayer.depth;

    topLayer.width = newWidth;
    topLayer.depth = newDepth;

    const newGeometry = new THREE.BoxGeometry(newWidth, boxHeight, newDepth);
    
    topLayer.threejs.geometry.dispose();
    topLayer.threejs.geometry = newGeometry;

    const outlineMesh = topLayer.threejs.getObjectByName("cartoonOutline");
    if (outlineMesh) {
        outlineMesh.geometry = newGeometry;
    }

    topLayer.threejs.position[direction] -= delta / 2;
    topLayer.cannonjs.position[direction] -= delta / 2;

    const shape = new CANNON.Box(
        new CANNON.Vec3(newWidth / 2, boxHeight / 2, newDepth / 2)
    );
    topLayer.cannonjs.shapes = [];
    topLayer.cannonjs.addShape(shape);

    
    topLayer.cannonjs.collisionFilterGroup = grupoPilha;
    topLayer.cannonjs.collisionFilterMask = grupoPilha;
}

function animation() {
    const speed = 0.15;
    const topLayer = stack[stack.length - 1];
    const direction = topLayer.direction;
    
    topLayer.threejs.position[direction] += speed * moveDirection;
    topLayer.cannonjs.position[direction] += speed * moveDirection;

    if (topLayer.threejs.position[direction] > 10 || topLayer.threejs.position[direction] < -10) {
        topLayer.threejs.position[direction] = 0;
        topLayer.cannonjs.position[direction] = 0;

        const newDirection = direction === "x" ? "z" : "x";
        topLayer.direction = newDirection;

        topLayer.threejs.position[newDirection] = -10;
        topLayer.cannonjs.position[newDirection] = -10;
        moveDirection = 1; 
    }

    if (camera.position.y < boxHeight * (stack.length - 2) + 4) {
        camera.position.y += speed;
    }
    
    updatePhysics();
    renderer.render(scene, camera);
}

function gameOverAnimation() {
    updatePhysics();
    renderer.render(scene, camera);

    const lastOverhang = overhangs[overhangs.length - 1];
    if (lastOverhang && lastOverhang.threejs.position.y < -15) {
        renderer.setAnimationLoop(null); 
        document.getElementById("restartBtn").style.display = "block";
    }
}

function updatePhysics() {
    world.step(1 / 60);

    overhangs.forEach((element) => {
        element.threejs.position.copy(element.cannonjs.position);
        element.threejs.quaternion.copy(element.cannonjs.quaternion);
    });
}

function playSound(type) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'perfect') {
        const now = ctx.currentTime;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.15);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
    } else if (type === 'growth') {
        
        const now = ctx.currentTime;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(800, now + 0.3);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    }
}

function triggerPerfectVisualEffect(colorHex) {
    const flash = document.getElementById("perfectFlash");
    flash.style.backgroundColor = colorHex;
    flash.style.opacity = "0.3"; 
    
   
    setTimeout(() => {
        flash.style.opacity = "0";
    }, 100);
}



window.addEventListener("click", (event) => {

    if (event.target.id === "restartBtn" || event.target.id === "startBtn") {
        return;
    }

    if (!gameStarted) {
        return; 
    }

    const topLayer = stack[stack.length - 1]; 
    const previousLayer = stack[stack.length - 2];
    const direction = topLayer.direction;

    const delta = topLayer.threejs.position[direction] - previousLayer.threejs.position[direction];
    const overhangSize = Math.abs(delta);
    const size = direction === "x" ? topLayer.width : topLayer.depth;

    const margemPerfeita = 0.1;

    if (overhangSize <= margemPerfeita) {

        perfectStreak++;
            
            topLayer.threejs.position[direction] = previousLayer.threejs.position[direction];
            topLayer.cannonjs.position[direction] = previousLayer.threejs.position[direction];

            const currentHex = "#" + topLayer.threejs.material.color.getHexString();
            triggerPerfectVisualEffect(currentHex);

            if (perfectStreak >= 3) {
                sizeBonus += 0.25; 
                playSound('growth'); 
                console.log("Combo de 3! O bloco está crescendo!");
            } else {
                playSound('perfect');
            }

            const nextDirection = direction === "x" ? "z" : "x";
            const nextX = nextDirection === "x" ? -10 : topLayer.threejs.position.x;
            const nextZ = nextDirection === "z" ? -10 : topLayer.threejs.position.z;

            addLayer(nextX, nextZ, topLayer.width, topLayer.depth, nextDirection, true);
            moveDirection = 1;

            score++; 
            document.getElementById("score").innerText = "Score: " + score;

        } else {
            perfectStreak = 0;
            sizeBonus = 0;

            const overlap = size - overhangSize;

            if (overlap > 0) {
                cutBox(topLayer, overlap, size, delta);
                
                const overhangShift = (overlap / 2 + overhangSize / 2) * Math.sign(delta);
                const overhangX = direction === "x" ? topLayer.threejs.position.x + overhangShift : topLayer.threejs.position.x;
                const overhangZ = direction === "z" ? topLayer.threejs.position.z + overhangShift : topLayer.threejs.position.z;
                const overhangWidth = direction === "x" ? overhangSize : topLayer.width;
                const overhangDepth = direction === "z" ? overhangSize : topLayer.depth;

                addOverhang(overhangX, overhangZ, overhangWidth, overhangDepth);

                const nextDirection = direction === "x" ? "z" : "x";
                const nextX = nextDirection === "x" ? -10 : topLayer.threejs.position.x;
                const nextZ = nextDirection === "z" ? -10 : topLayer.threejs.position.z;

                addLayer(nextX, nextZ, topLayer.width, topLayer.depth, nextDirection, true);
                moveDirection = 1;

                score++; 
                document.getElementById("score").innerText = "Score: " + score;
            } else {
                console.log("Game Over! Você errou o bloco.");
                gameStarted = false; 

                if (score > recorde) {
                    recorde = score;
                    localStorage.setItem("stack_recorde", recorde);
                }

                const overhangX = topLayer.threejs.position.x;
                const overhangZ = topLayer.threejs.position.z;
                const currentY = topLayer.threejs.position.y; 

                scene.remove(topLayer.threejs);
                if (topLayer.cannonjs) world.removeBody(topLayer.cannonjs);

                addOverhang(overhangX, overhangZ, topLayer.width, topLayer.depth, currentY);
                
                stack.pop();
                renderer.setAnimationLoop(gameOverAnimation);
            }
        }
    }
);

document.getElementById("restartBtn").addEventListener("click", (event) => {
    event.stopPropagation();
    restartGame();
});

document.getElementById("startBtn").addEventListener("click", (event) => {
    event.stopPropagation();
    
    document.getElementById("telaInicial").style.display = "none";
    document.getElementById("score").style.display = "block";
    
    const musica = document.getElementById("musicaFundo");
    if (musica) {
        musica.volume = 0.35;
        musica.play().catch(error => {
            console.log("O navegador bloqueou o autoplay de áudio:", error);
        });
    }

    renderer.setAnimationLoop(animation);
    gameStarted = true;
});

function restartGame() {
    document.getElementById("restartBtn").style.display = "none";
    
    document.getElementById("telaInicial").style.display = "block";
    document.getElementById("score").style.display = "none";
    
    document.getElementById("recordeText").innerText = "Recorde: " + recorde;
    
    renderer.setAnimationLoop(null);

    stack.forEach(layer => {
        scene.remove(layer.threejs);
        if (layer.cannonjs) world.removeBody(layer.cannonjs);
    });

    overhangs.forEach(overhang => {
        scene.remove(overhang.threejs);
        if (overhang.cannonjs) world.removeBody(overhang.cannonjs);
    });

    stack.length = 0;
    overhangs.length = 0;

    perfectStreak = 0;
    sizeBonus = 0

    gameStarted = false; 
    moveDirection = 1;
    score = 0;
    document.getElementById("score").innerText = "Score: 0";

   
    camera.position.set(4, 4, 4);
    camera.lookAt(0, 0, 0);

    addLayer(0, 0, originalBoxSize, originalBoxSize, "x", false);
    addLayer(-10, 0, originalBoxSize, originalBoxSize, "x", true);

    renderer.render(scene, camera);
}

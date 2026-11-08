// RocketSim for the browser: a small C interface over one soccar arena, for
// `src/physics/sim.ts`. Everything is in the game's own units (uu, Z up),
// except the arena meshes, which RocketSim keeps in Bullet's (uu / 50).
//
// The arena meshes are ours (`src/physics/arena-mesh.ts`), not dumped from the
// game: rs_mesh() takes each one before rs_init().

#include <emscripten/emscripten.h>

#include <cstring>
#include <map>
#include <vector>

#include "RocketSim.h"

using namespace RocketSim;

static std::vector<FileData> meshes;
static Arena* arena = nullptr;
static std::vector<Car*> cars;
static int goals[2] = {0, 0};
// RocketSim calls back on every tick the ball is in a net; a goal is the first of them.
static int scoredBy = -1;
static bool wasScored = false;

template <typename T>
static void put(FileData& out, const T& value) {
	const byte* bytes = reinterpret_cast<const byte*>(&value);
	out.insert(out.end(), bytes, bytes + sizeof(T));
}

extern "C" {

// One arena mesh: `vertices` as x, y, z in uu, `indices` as three per triangle.
EMSCRIPTEN_KEEPALIVE void rs_mesh(const float* vertices, int vertexCount, const int* indices, int triangleCount) {
	FileData file;
	put(file, int32_t(triangleCount));
	put(file, int32_t(vertexCount));
	for (int i = 0; i < triangleCount * 3; i++) put(file, int32_t(indices[i]));
	for (int i = 0; i < vertexCount * 3; i++) put(file, float(vertices[i] * UU_TO_BT));
	meshes.push_back(file);
}

// Loads the meshes and makes the arena, with the ball's spin simulated. As in
// the game, a ball put somewhere without speed stays there until touched.
EMSCRIPTEN_KEEPALIVE void rs_init() {
	RocketSim::InitFromMem({{GameMode::SOCCAR, meshes}}, true);
	ArenaConfig config = {};
	config.noBallRot = false;
	arena = Arena::Create(GameMode::SOCCAR, config, 120);
	arena->SetGoalScoreCallback([](Arena*, Team team, void*) { scoredBy = (int)team; });
}

// Adds an Octane for team 0 (Blue) or 1 (Orange) and returns its index.
EMSCRIPTEN_KEEPALIVE int rs_add_car(int team) {
	cars.push_back(arena->AddCar(team ? Team::ORANGE : Team::BLUE, CAR_CONFIG_OCTANE));
	return int(cars.size()) - 1;
}

EMSCRIPTEN_KEEPALIVE void rs_controls(int car, float throttle, float steer, float pitch, float yaw, float roll, int jump, int boost, int handbrake) {
	CarControls& controls = cars[car]->controls;
	controls.throttle = throttle;
	controls.steer = steer;
	controls.pitch = pitch;
	controls.yaw = yaw;
	controls.roll = roll;
	controls.jump = jump;
	controls.boost = boost;
	controls.handbrake = handbrake;
	controls.ClampFix();
}

EMSCRIPTEN_KEEPALIVE void rs_step(int ticks) {
	for (int i = 0; i < ticks; i++) {
		scoredBy = -1;
		arena->Step(1);
		if (scoredBy >= 0 && !wasScored) goals[scoredBy]++;
		wasScored = scoredBy >= 0;
	}
}

// A random kickoff (seed -1) or a chosen one, with the score as it was.
EMSCRIPTEN_KEEPALIVE void rs_kickoff(int seed) {
	arena->ResetToRandomKickoff(seed);
	wasScored = false;
}

EMSCRIPTEN_KEEPALIVE int rs_goals(int team) { return goals[team]; }

// Unlimited boost, as in the game's free play: none is used, and cars are filled now and at each kickoff.
EMSCRIPTEN_KEEPALIVE void rs_unlimited_boost(int on) {
	MutatorConfig config = arena->GetMutatorConfig();
	config.boostUsedPerSecond = on ? 0 : RLConst::BOOST_USED_PER_SECOND;
	config.carSpawnBoostAmount = on ? 100 : RLConst::BOOST_SPAWN_AMOUNT;
	arena->SetMutatorConfig(config);
	if (!on) return;
	for (Car* car : cars) {
		CarState state = car->GetState();
		state.boost = 100;
		car->SetState(state);
	}
}

static float* body(float* out, const PhysState& state) {
	const Vec* vectors[] = {&state.pos, &state.rotMat.forward, &state.rotMat.right, &state.rotMat.up, &state.vel, &state.angVel};
	for (const Vec* vector : vectors) {
		*out++ = vector->x;
		*out++ = vector->y;
		*out++ = vector->z;
	}
	return out;
}

// The ball's state (18 floats: position, forward, right, up, velocity, spin)
// into `out`, then each car's: the same 18, boost (0–100), and flags
// (1 on the ground, 2 boosting, 4 supersonic, 8 demolished), then each pad's
// 1 when it's there.
EMSCRIPTEN_KEEPALIVE void rs_state(float* out) {
	out = body(out, arena->ball->GetState());
	for (Car* car : cars) {
		CarState state = car->GetState();
		out = body(out, state);
		*out++ = state.boost;
		*out++ = float((state.isOnGround ? 1 : 0) | (state.isBoosting ? 2 : 0) | (state.isSupersonic ? 4 : 0) | (state.isDemoed ? 8 : 0));
	}
	for (BoostPad* pad : arena->GetBoostPads()) *out++ = pad->GetState().isActive ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int rs_pad_count() { return int(arena->GetBoostPads().size()); }

// Each pad's position (x, y, z) and 1 when it's big, into `out`.
EMSCRIPTEN_KEEPALIVE void rs_pads(float* out) {
	for (BoostPad* pad : arena->GetBoostPads()) {
		Vec pos = pad->config.pos;
		*out++ = pos.x;
		*out++ = pos.y;
		*out++ = pos.z;
		*out++ = pad->config.isBig ? 1 : 0;
	}
}

static PhysState read(const float* in) {
	PhysState state;
	state.pos = Vec(in[0], in[1], in[2]);
	state.rotMat = RotMat(Vec(in[3], in[4], in[5]), Vec(in[6], in[7], in[8]), Vec(in[9], in[10], in[11]));
	state.vel = Vec(in[12], in[13], in[14]);
	state.angVel = Vec(in[15], in[16], in[17]);
	return state;
}

// Puts the ball where `in` says (the 18 floats of rs_state).
EMSCRIPTEN_KEEPALIVE void rs_set_ball(const float* in) {
	BallState state = arena->ball->GetState();
	static_cast<PhysState&>(state) = read(in);
	arena->ball->SetState(state);
}

// Puts a car where `in` says (the 18 floats of rs_state, then boost), on its
// wheels' flags as they were, with its jump and flip back.
EMSCRIPTEN_KEEPALIVE void rs_set_car(int car, const float* in) {
	CarState state = cars[car]->GetState();
	static_cast<PhysState&>(state) = read(in);
	state.boost = in[18];
	state.hasJumped = state.hasDoubleJumped = state.hasFlipped = false;
	state.isJumping = state.isFlipping = false;
	state.isDemoed = false;
	cars[car]->SetState(state);
}
}

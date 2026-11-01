/** Friendly placeholder names so students can skip typing one (spec §7). */
const ADJECTIVES = [
    "Blue", "Brave", "Calm", "Clever", "Swift", "Bright", "Quiet", "Lucky", "Bold", "Gentle",
    "Happy", "Kind", "Sunny", "Witty", "Golden", "Silver", "Misty", "Rapid", "Cosmic", "Mellow",
];
const ANIMALS = [
    "Fox", "Owl", "Lynx", "Otter", "Falcon", "Panda", "Koala", "Heron", "Badger", "Dolphin",
    "Wolf", "Raven", "Tiger", "Gecko", "Bison", "Moose", "Hare", "Puffin", "Seal", "Crane",
];

export function randomName() {
    const r = crypto.getRandomValues(new Uint32Array(2));
    return `${ADJECTIVES[r[0] % ADJECTIVES.length]} ${ANIMALS[r[1] % ANIMALS.length]}`;
}

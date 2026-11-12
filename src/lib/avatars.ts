export const avatarIds = [
  "avatar-1",
  "avatar-2",
  "avatar-3",
  "avatar-4",
  "avatar-5",
  "avatar-6",
  "avatar-7",
  "avatar-8",
  "avatar-9",
] as const;

export const defaultAvatarId = avatarIds[0];

const cats: Record<(typeof avatarIds)[number], {
  file: string;
  name: string;
  bg: string;
}> = {
  "avatar-1": { file: "cat_01_excited", name: "Excited cat", bg: "#ffe7a6" },
  "avatar-2": { file: "cat_02_sleepy", name: "Sleepy cat", bg: "#dcd5ff" },
  "avatar-3": { file: "cat_03_surprised", name: "Surprised cat", bg: "#cbf4e6" },
  "avatar-4": { file: "cat_04_curious", name: "Curious cat", bg: "#cce7fa" },
  "avatar-5": { file: "cat_05_cozy", name: "Cozy cat", bg: "#d8efff" },
  "avatar-6": { file: "cat_06_mischievous", name: "Mischievous cat", bg: "#ffd7ef" },
  "avatar-7": { file: "cat_07_shy", name: "Shy cat", bg: "#ffcadb" },
  "avatar-8": { file: "cat_08_confused", name: "Confused cat", bg: "#fff2b6" },
  "avatar-9": { file: "cat_09_music_lover", name: "Music lover cat", bg: "#e6d9ff" },
};

export const AVATARS = avatarIds.map((id) => {
  const { file, name, bg } = cats[id];
  return { id, name, bg, src: `/images/profile/cat_variations_svg/${file}.svg` };
});

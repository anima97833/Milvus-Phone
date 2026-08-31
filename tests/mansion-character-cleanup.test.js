const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const run = async () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "Milvus", "app.min.js"),
    "utf8",
  );
  const start = source.indexOf("const MANSION_GUEST_IDS =");
  const end = source.indexOf("const HeartPaperMansion =", start);
  assert.ok(start >= 0 && end > start, "找不到心纸居角色清理函数");
  assert.equal(
    (source.match(/await cleanupDeletedCharacterFromMansion\(id\);/g) || []).length,
    2,
    "所有永久删除入口都必须清理心纸居引用",
  );

  const storage = new Map([
    ["t8_mansion_active_ids", JSON.stringify(["keep", 7, "deleted"])],
    [
      "t8_mansion_custom_avatars",
      JSON.stringify({ keep: ["keep.png"], 7: ["seven.png"], deleted: ["gone.png"] }),
    ],
  ]);
  let spriteRecord = {
    key: "mansion_character_sprites",
    value: { keep: ["keep.png"], 7: ["seven.png"], deleted: ["gone.png"] },
  };
  const objectStore = {
    get() {
      const request = {};
      queueMicrotask(() => {
        request.result = structuredClone(spriteRecord);
        request.onsuccess();
      });
      return request;
    },
    put(value) {
      spriteRecord = structuredClone(value);
      const request = {};
      queueMicrotask(() => request.onsuccess());
      return request;
    },
  };
  const context = {
    console: { warn() {} },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    window: {
      STORES: { USER_SETTINGS: "user_settings" },
      openDB: async () => ({
        transaction: () => ({ objectStore: () => objectStore }),
      }),
    },
  };
  vm.runInNewContext(
    source
      .slice(start, end)
      .replace(
        /const (sanitizeMansionActiveIds|resolveMansionActiveIds|resolveMansionCharacter|cleanupDeletedCharacterFromMansion) =/g,
        "globalThis.$1 =",
      ),
    context,
  );

  const chats = [
    { id: "keep", name: "保留角色" },
    { id: 7, name: "数字角色" },
    { id: "third", name: "第三位" },
    { id: "fourth", name: "第四位" },
    { id: "fifth", name: "第五位" },
    { id: "sixth", name: "第六位" },
  ];
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.sanitizeMansionActiveIds(
      ["deleted", "keep", "keep", "7", "guest_default_1", "third", "fourth", "fifth"],
      chats,
    ))),
    ["keep", "7", "guest_default_1", "third", "fourth"],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.resolveMansionActiveIds(["deleted"], chats))),
    ["keep", 7, "third"],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.resolveMansionActiveIds(["deleted"], []))),
    ["guest_default_1", "guest_default_2"],
  );
  assert.equal(context.resolveMansionCharacter("missing", chats), null);
  assert.equal(context.resolveMansionCharacter("7", chats).name, "数字角色");
  assert.equal(context.resolveMansionCharacter("guest_default_1", chats).name, "少侠喵");

  await context.cleanupDeletedCharacterFromMansion("deleted");
  assert.deepEqual(JSON.parse(storage.get("t8_mansion_active_ids")), ["keep", 7]);
  assert.deepEqual(JSON.parse(storage.get("t8_mansion_custom_avatars")), {
    keep: ["keep.png"],
    7: ["seven.png"],
  });
  assert.deepEqual(spriteRecord.value, {
    keep: ["keep.png"],
    7: ["seven.png"],
  });

  await context.cleanupDeletedCharacterFromMansion("7");
  assert.deepEqual(JSON.parse(storage.get("t8_mansion_active_ids")), ["keep"]);
  assert.deepEqual(JSON.parse(storage.get("t8_mansion_custom_avatars")), {
    keep: ["keep.png"],
  });
  assert.deepEqual(spriteRecord.value, {
    keep: ["keep.png"],
  });

  console.log("mansion character cleanup helpers: ok");
};

run();

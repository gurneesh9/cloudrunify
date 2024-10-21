import { parse, stringify } from "npm:yaml";

const yamlStr = await Deno.readTextFile("../test.yaml");
const doc = parse(yamlStr);

console.log(doc) // This Gives JSON
console.log(stringify(doc)) // This gives String
import TCPScan from "./lib/TCPScan";

const scanner = new TCPScan({
	ip: "1.1.1.1",
	port: 80
});
console.log(scanner);

console.log("\nRUNNING...");
scanner.analyze().then(resp => console.log(scanner.result));

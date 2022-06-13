import fs from "node:fs";
import net from "node:net";
import { StringDecoder } from "node:string_decoder";
import negotiate from "./TelnetNegotiation";

type TCPScannerPassOptions = {
	ip: string;
	port: number;
	bannerLength?: number;
	timeout?: number;
}

type TCPScannerOptions = {
	ip: string;
	port: number;
	bannerLength: number;
	timeout: number;
}

class TCPScan {
	options: TCPScannerOptions;
	socket?: net.Socket;
	bufferArray: Uint8Array[];
	result: {
		banner: String | Buffer;
		raw: Buffer;
		status: string;
		open: boolean;
	}
	res: Function;

	constructor(options: TCPScannerPassOptions) {
		this.options = Object.assign({
			bannerLength: 512,
			timeout: 2 * 1000
		}, options);

		if(!this.options.ip) throw new Error("No IP provided.");
		if(!this.options.port) throw new Error("No Port provided.");

		this.socket;
		this.res = () => 0;
		this.bufferArray = [];
		this.result = {
			banner: "",
			raw: Buffer.alloc(0),
			status: "",
			open: false
		};

		return this;
	}

	formatBanner(buf: Buffer) {
		let banner: String = new StringDecoder("utf-8").write(buf);
		banner = banner.toString();

		banner = banner.replace(/\n/gm, "\\n");
		banner = banner.replace(/\r/gm, "\\r");
		banner = banner.replace(/\t/gm, "\\t");
		banner = banner.replace(/ *$/, "");
		banner = banner.replace(/^ */, "");
		banner = banner.substr(0, this.options.bannerLength);

		return banner;
	}

	analyze() {
		return new Promise(res => {
			this.res = res;

			this.socket = net.createConnection(this.options.port, this.options.ip);
			this.socket.removeAllListeners("timeout");
			this.socket.setTimeout(this.options.timeout);

			this.socket.on("connect", this._connect.bind(this));
			this.socket.on("close", this._close.bind(this));
			this.socket.on("data", this._data.bind(this));
			this.socket.on("timeout", this._timeout.bind(this));
			this.socket.on("error", this._error.bind(this));
		});
	}

	_send() {
		if(this.bufferArray.length) this.result.raw = Buffer.concat(this.bufferArray);
		if(this.result.banner) this.result.banner = this.formatBanner(Buffer.from(this.result.banner));

		if(!this.result.status) {
			if(!this.result.open) {
				this.result.status = "SILENCE";
			} else this.result.status = "RESPONSE";
		}

		if(this.socket) {
			this.socket.destroy();
			delete this.socket;
		}

		return this.res();
	}

	_close() {
		if(!this.result.banner) this.result.open = false;
		return this._send();
	}

	_error(e: Error) {
		if(e.message.match(/ECONNREFUSED/)) return this.result.status = "CONNECTION REFUSED";
		if(e.message.match(/EHOSTUNREACH/)) return this.result.status = "HOST UNREACHABLE";
		return this.result.status = `FAILURE: ${e.message}`;
	}

	_connect() {
		this.result.open = true;
	}

	_timeout() {
		if(!this.result.open) this.result.status = "TIMEOUT";
		if(this.result.open) this.result.status = "RESPONSE";
		this.socket && this.socket.destroy();
		return delete this.socket;
	}

	_data(buf: Buffer) {
		this.bufferArray.push(buf);
		if(!this.socket) throw new Error("Invalid socket");
		buf = negotiate(buf, this.socket);
		if(this.result.banner.length < this.options.bannerLength) {
			let d = buf.toString("ascii");
			return this.result.banner += d;
		}
		this.socket && this.socket.destroy();
		return delete this.socket;
	}
}

export default TCPScan;

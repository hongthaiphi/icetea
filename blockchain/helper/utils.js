exports.prepareState = (addr, stateTable, initialValues) {
    if (!stateTable[addr]) {
        stateTable[addr] = {};
    }

    if (!stateTable[addr].balance) {
        let balance = 0;

        Object.defineProperty(stateTable[addr], "balance", {
            get = () => balance,
            set = (value) => {
                if (value < 0) {
                    throw new Error("Balance cannot be negative")
                }
                balance = value;
            }
        })
    }

    if (initialValues) {
        Object.assign(stateTable[addr], initialValues);
    }
    
    return stateTable[addr];
}

exports.incBalance = (addr, delta, stateTable) => {
    const state = exports.prepareState(addr, stateTable);
    state.balance += parseFloat(delta) || 0;
}

exports.decBalance = (addr, delta, stateTable) => {
    exports.incBalance(addr, -delta, stateTable);
}
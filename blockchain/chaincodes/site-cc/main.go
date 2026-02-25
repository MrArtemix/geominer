// ---------------------------------------------------------------------------
// Ge O'Miner  --  site-cc Chaincode Entry Point
// ---------------------------------------------------------------------------
package main

import (
	"log"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

func main() {
	siteContract := new(SiteContract)

	chaincode, err := contractapi.NewChaincode(siteContract)
	if err != nil {
		log.Fatalf("Error creating site-cc chaincode: %v", err)
	}

	chaincode.Info.Title = "GeOMiner Site Chaincode"
	chaincode.Info.Version = "1.0.0"

	if err := chaincode.Start(); err != nil {
		log.Fatalf("Error starting site-cc chaincode: %v", err)
	}
}

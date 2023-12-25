
/*

Created by Spentine
Date of Creation: 2023.11.27

*/

console.log("compressor.js loaded");

latestFile = undefined;

// List of compressor settings
const compressorOptionsList = [
  "commentRemoval",
  "removeUnusedScripts",
  "removeMenuBlocks",
  "assetNameToNumber",
  "safeTypeConversion",
  "typeConversion",
  "shadowBlocks",
  "simplifyBlockIDs",
  "simplifyVariableIDs",
  "simplifyListIDs",
  "simplifyCommentIDs",
]

// compress project.json
function compressProjectJSON(projectJSON, options) {
  
  // remove comments
  if (options.commentRemoval) {
    for (let i=0; i<projectJSON.targets.length; i++) {
      projectJSON.targets[i].comments = {};
      const currentTargetBlocks = projectJSON.targets[i].blocks;
      const blockIDs = Object.keys(currentTargetBlocks);
      for (let j=0; j<blockIDs.length; j++) {
        delete currentTargetBlocks[blockIDs[j]].comment;
      }
    }
  }
  
  // shadow blocks
  if (options.shadowBlocks) {
    for (let targetIndex=0; targetIndex<projectJSON.targets.length; targetIndex++) {
      const currentTargetBlocks = projectJSON.targets[targetIndex].blocks;
      const blockIDs = Object.keys(currentTargetBlocks); 
      for (let blockIndex=0; blockIndex<blockIDs.length; blockIndex++) {
        currentBlock = currentTargetBlocks[blockIDs[blockIndex]];
        if (typeof currentBlock.length === "undefined") { // if it's an actual block
          currentBlock.shadow = true;
        }
      }
    }
  } 
  
  // simplify block ids
  // ISSUE: if only simplifyBlockIDs is true, there is a comment with id 0 and a block, then it will fuck up bc the block id will be set to 0 and the comment will die
  if (options.simplifyBlockIDs) {
    for (let targetIndex=0; targetIndex<projectJSON.targets.length; targetIndex++) {
      
      // create new IDs for the old IDs and add them in an object
      let currentTargetBlocks = projectJSON.targets[targetIndex].blocks;
      let correspondingIDs = {};
      const originalIDs = Object.keys(currentTargetBlocks);
      for (let i=0; i<originalIDs.length; i++) {
        correspondingIDs[originalIDs[i]] = convertID(i);
      }
      
      // make the switch
      let newBlocks = {};
      for (let i=0; i<originalIDs.length; i++) {
        let blockID = originalIDs[i];
        newBlocks[correspondingIDs[blockID]] = currentTargetBlocks[blockID];
        blockID = correspondingIDs[blockID];
        const currentTargetBlock = newBlocks[blockID];
        
        // if the block is an actual block and not a floating variable or something
        // floating variables are arrays rather than objects and you can actually use .length on it
        if (typeof currentTargetBlock.length === "undefined") {
          if (currentTargetBlock.next) { // a bit dangerous but should reject null values
          // the `next` and `parent` keys correspond to the previous and next block
            currentTargetBlock.next = correspondingIDs[currentTargetBlock.next]; // switch
          }
          if (currentTargetBlock.parent) { // a bit dangerous but should reject null values
            currentTargetBlock.parent = correspondingIDs[currentTargetBlock.parent]; // switch
          }
          
          // sometimes the inputs might contain blocks
          const inputs = currentTargetBlock.inputs;
          const inputsKeys = Object.keys(inputs);
          for (let j=0; j<inputsKeys.length; j++) {
            const input = inputs[inputsKeys[j]];
            // regular inputs are arrays
            if (typeof input[1] === "string") {
              input[1] = correspondingIDs[input[1]];
            }
            if (input[0] === 3) { // the second item might be a block
              if (typeof input[2] === "string") {
                input[2] = correspondingIDs[input[2]];
              }
            }
          }
        }
      }
      
      // make the comments synced up
      /*
      const comments = projectJSON.targets[targetIndex].comments;
      const commentKeys = Object.keys(comments); 
      for (let i=0; i<commentKeys.length; i++) {
        let commentBlockID = comments[commentKeys[i]].blockId;
        if (commentBlockID !== null) {
          if (commentBlockID in correspondingIDs) {
            comments[commentKeys[i]].blockId = correspondingIDs[commentBlockID];
          } else {
            delete comments[commentKeys[i]];
          }
        }
      }
      */
      
      currentTargetBlocks = newBlocks; // overwrite currentTargetBlocks with newBlocks pointer
      
      let commentBlockAssociation = {};
      let blockIDs = Object.keys(currentTargetBlocks);
      for (i=0; i<blockIDs.length; i++) {
        let block = currentTargetBlocks[blockIDs[i]];
        if ("comment" in block) {
          commentBlockAssociation[block.comment] = blockIDs[i];
        }
      }
      
      const comments = projectJSON.targets[targetIndex].comments;
      const commentKeys = Object.keys(comments); 
      for (let i=0; i<commentKeys.length; i++) {
        let commentBlockID = comments[commentKeys[i]].blockId;
        if (commentBlockID !== null) {
          if (commentKeys[i] in commentBlockAssociation) {
            comments[commentKeys[i]].blockId = commentBlockAssociation[commentKeys[i]];
          }
        }
      }
      
      projectJSON.targets[targetIndex].blocks = currentTargetBlocks; // modify original object
    }
  }
  
  // simplify variable and list IDs
  /*
  targetIndex is the index from the target to find the variables
  inputIndex is the block input id number that corresponds with it
  fieldIndex is the field that corresponds to it
  */
  const allTypeKeys = {"variable": {"targetIndex": "variables", "fieldIndex": "VARIABLE", "inputIndex": 12}, "list": {"targetIndex": "lists", "fieldIndex": "LIST", "inputIndex": 13}};
  
  const currentIDs = {0: 0}; // list IDs must not intersect with variable IDs for some reason (there is enough context to determine which is which)
  
  for (let type=0; type<2; type++) {
    // load type
    const typeKeys = allTypeKeys[["variable", "list"][type]];
    
    // if the user enabled the option that corresponds with the type
    if ((type === 0 && options.simplifyVariableIDs) || (type === 1 && options.simplifyListIDs)) {
      // global variables
      let variableIDs = Object.keys(projectJSON.targets[0][typeKeys.targetIndex]);
      const correspondingGlobalIDs = {};
      const maxIDs = Math.max(... Object.values(currentIDs)); // handle case where a local variable in a sprite with the same name and ID as a global list (making IDs different)
      for (let i=0; i<variableIDs.length; i++) {
        correspondingGlobalIDs[variableIDs[i]] = convertID(i + maxIDs);
      }
      const globalAmount = variableIDs.length;
      
      for (let targetIndex = 0; targetIndex < projectJSON.targets.length; targetIndex++) {
        const currentTarget = projectJSON.targets[targetIndex];
        
        const correspondingIDs = {...correspondingGlobalIDs};
        
        // if the target isn't the stage then get the local variables
        if (!(targetIndex in currentIDs)) {
          currentIDs[targetIndex] = 0;
        }
        
        if (targetIndex !== 0) {
          variableIDs = Object.keys(currentTarget[typeKeys.targetIndex]);
          for (let i=0; i<variableIDs.length; i++) {
            correspondingIDs[variableIDs[i]] = convertID(i + globalAmount + currentIDs[targetIndex]);
          }
        }
        
        currentIDs[targetIndex] = variableIDs.length + globalAmount;
        
        // this will overwrite the variables or lists key in the target to update the ids
        const newVariableIDs = {};
        for (let i=0; i<variableIDs.length; i++) {
          newVariableIDs[correspondingIDs[variableIDs[i]]] = currentTarget[typeKeys.targetIndex][variableIDs[i]];
        }
        currentTarget[typeKeys.targetIndex] = newVariableIDs;
        
        const blocks = Object.keys(currentTarget.blocks);
        for (let blockIndex=0; blockIndex<blocks.length; blockIndex++) {
          const currentBlock = currentTarget.blocks[blocks[blockIndex]];
          if (typeof currentBlock.length === "undefined") { // if it is an actual block
            if (typeKeys.fieldIndex in currentBlock.fields) {
              currentBlock.fields[typeKeys.fieldIndex][1] = correspondingIDs[currentBlock.fields[typeKeys.fieldIndex][1]]
            }
            const inputs = Object.keys(currentBlock.inputs);
            for (let i=0; i<inputs.length; i++) {
              const input = currentBlock.inputs[inputs[i]];
              // null counts as an object for some reason
              if (typeof input[1] === "object" && input[1] !== null && input[1][0] === typeKeys.inputIndex) {
                input[1][2] = correspondingIDs[input[1][2]];
              }
              if (input[0] === 3) {
                if (typeof input[2] === "object" && input[2] !== null && input[2][0] === typeKeys.inputIndex) {
                  input[2][2] = correspondingIDs[input[2][2]];
                }
              }
            }
          } else { // if it is a floating variable
            if (currentBlock[0] === typeKeys.inputIndex) {
              currentBlock[2] = correspondingIDs[currentBlock[2]];
            }
          }
        }
      }
    }
  }
  
  if (options.simplifyCommentIDs) {
    for (let targetIndex=0; targetIndex<projectJSON.targets.length; targetIndex++) {
      let currentTargetComments = projectJSON.targets[targetIndex].comments;
      const currentTargetBlocks = projectJSON.targets[targetIndex].blocks;
      const blockIDs = Object.keys(currentTargetBlocks);
      let commentKeys = Object.keys(currentTargetComments);
      
      // ok so the reason all this is commented out is because turns out scratch doesn't really care about comment.blockId but rather block.comment more so im redoing this whole thing
      /*
      for (let i=0; i<commentKeys.length; i++) {
        let comment = currentTargetComments[commentKeys[i]];
        if ((!(comment.blockId in projectJSON.targets[targetIndex].blocks) || (projectJSON.targets[targetIndex].blocks[comment.blockId].comment && typeof projectJSON.targets[targetIndex].blocks[comment.blockId].length === "undefined") !== commentKeys[i]) && comment.blockId !== null) { // if the blockid is invalid or the block doesnt recognize the comment as its comment unless the block is a variable
          delete currentTargetComments[commentKeys[i]];
        }
      }
      */
      
      let commentBlockAssociation = {};
      for (i=0; i<blockIDs.length; i++) {
        let block = currentTargetBlocks[blockIDs[i]];
        if ("comment" in block) {
          commentBlockAssociation[block.comment] = blockIDs[i];
        }
      }
      
      const newComments = {};
      let correspondingIDs = {};
      let j = 0;
      for (let i=0; i<commentKeys.length; i++) {
        while (blockIDs.includes(convertID(j))) { // block ids and comment ids can not intersect
          j++;
        }
        newComments[convertID(j)] = currentTargetComments[commentKeys[i]];
        let block = currentTargetComments[commentKeys[i]].blockId;
        if (commentKeys[i] in commentBlockAssociation) {
          projectJSON.targets[targetIndex].blocks[commentBlockAssociation[commentKeys[i]]].comment = convertID(j);
        }
        j++;
      }
      
      currentTargetComments = newComments;
      projectJSON.targets[targetIndex].comments = currentTargetComments; // the javascript developers were snorting some crack
    }
  }
  
  return projectJSON;
}

/*
geometric series closed form solution

f(x, y) = x^0 + x^1 + x^2 ... x^y

f(x, y) = 1 + x(f(x, y) - x^y)
n = 1 + x(n - x^y)
n = 1 + xn - x^(y + 1)
n(1 - x) = 1 - x^(y + 1)

f(x, y) = (1 - x^(y + 1)) / (1 - x)
*/

function geometricSeries(x, y) {
  return (1 - Math.pow(x, y + 1)) / (1 - x)
}

/*
reverse geometric series closed form solution

n = (1 - x^(y + 1)) / (1 - x)

n(1 - x) = 1 - x^(y + 1)
n(1 - x) - 1 = - x^(y + 1)
- n(1 - x) + 1 = x^(y + 1)
n(x - 1) + 1 = x^(y + 1)
ln(n(x - 1) + 1) / ln x = y + 1

f(x, n) = (ln(n(x - 1) + 1) / ln x) - 1
*/

function reverseGeometricSeries(x, n) {
  return (Math.log(n * (x - 1) + 1) / Math.log(x)) - 1
}

/*
determining the amount of digits to use in the ID using reverse geometric series:

- a value less than the one in the series will still have the same amount of digits so use math.ceil
- due to floating point shit you subtract a tiny ass amount before using Math.ceil()

important note: scratch does not play well with 0-length ids so add 2
*/

function calculateIDDigitAmount(x, n) {
  // 1e-10 is a correction term
  return Math.ceil(reverseGeometricSeries(x, n + 2) - 1e-10)
}

/*
num: the number that will be converted to the base
numerals: the digits that will be used in the output base, eg; "abcde" for base 5
digits: the number of digits (controls padding)
*/

function numberToBase(num, numerals, digits) {
  const base = numerals.length;
  var output = "";
  for (let i=0; i < digits; i++) {
    output = numerals[(num % base)] + output;
    num = Math.floor(num / base);
  }
  return output;
}

function convertID(index) {
  // characters that can be used in block IDs
  const validIDChars =  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#%()*+,-./:;=?[]^`_{|}~";
  
  const base = validIDChars.length;
  const digits = calculateIDDigitAmount(base, index);
  
  // calculates new index based on amount of digits
  index -= geometricSeries(base, digits - 1) - 1;
  
  // converts new index and digits into ID
  return numberToBase(index, validIDChars, digits);
}

// compress button clicked
function compressClicked() {
  console.log("compress button clicked"); // log action
  
  // Loops through compressor settings and creates a dictionary with the values of each setting. (string: bool)
  var compressorOptions = {}
  for (let i=0; i<compressorOptionsList.length; i++) {
    compressorOptions[compressorOptionsList[i]] = document.getElementById(compressorOptionsList[i]).checked;
  }
  console.log(compressorOptions); // log the options
  
  const file = document.getElementById("originalFile").files[0]; // get file
  
  if (typeof file === "undefined") {
    // no file has been entered so the file has just been set as undefined. needless to say jszip doesnt like undefined.
    console.log("no file entered");
    return undefined;
  }
  
  return compressProject(file, compressorOptions); // compress project
}

function compressProject(file, options) {
  var zip = new JSZip();
  zip.loadAsync(file)
    .then(function(project) {
      // `project` is the zip
      
      // you are not using this, you are only modifying the project.json
      // this might be useful for an analyzer of some sort
      /*
      project.forEach(function (relativePath, zipEntry) {
        // relativePath is the path to the file
        // zipEntry is the compressed file itself
        let n = zipEntry.name;
        n = n.slice(n.indexOf('.') + 1); // get the file format
        console.log(n);
        
        zipEntry.async("string").then(function (data) {
          
        });
      });
      */
      
      // get project.json file as `data`
      zip.file("project.json").async("string").then(function (data) {
        // compress project.json file and overwrite the original
        
        const originalSize = (new TextEncoder().encode(data)).length; // get UTF8 size of JSON in bytes
        console.log("Original size: " + originalSize);
        
        data = JSON.parse(data); // parse JSON
        
        // console.log(data); // log JSON for debugging
        // commented out because the console sometimes traces the object after the manipulations have been performed
        
        const compressedJSON = compressProjectJSON(data, options);
        console.log(compressedJSON); // log compressedJSON for debugging
        
        const stringifiedJSON = JSON.stringify(compressedJSON);
        
        const newSize = (new TextEncoder().encode(stringifiedJSON)).length; // get UTF8 size of JSON in bytes
        console.log("New size: " + newSize);
        console.log("Removed " + (100 * (1 - (newSize / originalSize))) + "%");
        console.log((100 * (newSize / originalSize)) + "% remaining");
        
        // overwrite original project.json file
        zip.file("project.json", stringifiedJSON);
        
        // save sb3 to latestFile
        zip.generateAsync({type:"blob"})
          .then(function (blob) {
            latestFile = blob;
          });
      });
    
    }, function (e) {
      console.log(e); // error
    });
}

function download() {
  if (typeof latestFile === "undefined") {
    // no file was compiled
    console.log("no file compiled");
    return undefined;
  }
  
  saveAs(latestFile, "output.sb3");
}

function getJSON() {
  const file = document.getElementById("originalFile").files[0]; // get file
  
  if (typeof file === "undefined") {
    // no file has been entered
    console.log("no file entered");
    return undefined;
  }
  
  var zip = new JSZip();
  zip.loadAsync(file)
    .then(function(project) {
      zip.file("project.json").async("string").then(function (data) {
        const size = (new TextEncoder().encode(data)).length; // get UTF8 size of JSON in bytes
        console.log("Size: " + size);
        
        data = JSON.parse(data); // parse JSON
        
        console.log(data); // log JSON for debugging
        return null;
      });
    }, function (e) {
      console.log(e); // error
    });
}
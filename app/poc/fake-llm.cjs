// Deterministic stub only: external text is never executed or used as an instruction.
const fakeLLM=event=>event.stub_proposal||{action:'review',task_id:null};
module.exports={fakeLLM};

export function markedCase(id, category, word, canonical, markedSentence, kind = 'expression') {
  const tokens = [];
  const members = [];
  let clickedIndex = -1;
  const pattern = /\{\{([^}]+)\}\}|\[\[([^\]]+)\]\]|[A-Za-z](?:[A-Za-z'’-]*[A-Za-z])?/g;
  for (const match of markedSentence.matchAll(pattern)) {
    const token = match[1] ?? match[2] ?? match[0];
    const index = tokens.push(token) - 1;
    if (match[1] !== undefined) {
      if (clickedIndex !== -1) throw new Error(`${id} has more than one clicked token`);
      clickedIndex = index;
      members.push(index);
    } else if (match[2] !== undefined) {
      members.push(index);
    }
  }
  if (clickedIndex === -1) throw new Error(`${id} has no clicked token`);
  return {
    id,
    category,
    word,
    clicked: tokens[clickedIndex],
    sentence: markedSentence.replaceAll('{{', '').replaceAll('}}', '').replaceAll('[[', '').replaceAll(']]', ''),
    tokens,
    clickedIndex,
    expected: { kind, canonical, members: kind === 'word' ? [clickedIndex] : members.sort((a, b) => a - b) },
  };
}

const expressionGroups = [
  ['separable', 'give', 'give up', ['They {{gave}} the idea [[up]] after the vote.', 'She {{gave}} her seat [[up]] without complaint.']],
  ['separable', 'rule', 'rule out', ['The doctor {{ruled}} infection [[out]] after the tests.', 'We cannot {{rule}} that option [[out]] yet.']],
  ['separable', 'put', 'put off', ['They {{put}} the meeting [[off]] until Friday.', 'Do not {{put}} your decision [[off]] again.']],
  ['separable', 'carry', 'carry out', ['The team {{carried}} the plan [[out]] carefully.', 'Scientists will {{carry}} more tests [[out]] tomorrow.']],
  ['separable', 'bring', 'bring up', ['Mina {{brought}} the budget [[up]] during lunch.', 'Please do not {{bring}} that subject [[up]] tonight.']],
  ['separable', 'turn', 'turn down', ['He {{turned}} the offer [[down]] politely.', 'The committee may {{turn}} our request [[down]].']],
  ['separable', 'call', 'call off', ['They {{called}} the match [[off]] because of rain.', 'The union might {{call}} the strike [[off]].']],
  ['separable', 'set', 'set up', ['We {{set}} the equipment [[up]] before dawn.', 'She will {{set}} a meeting [[up]] for Monday.']],
  ['separable', 'take', 'take apart', ['Leo {{took}} the engine [[apart]] in the garage.', 'Can you {{take}} this clock [[apart]] safely?']],
  ['separable', 'pick', 'pick up', ['I {{picked}} the parcel [[up]] after work.', 'Please {{pick}} your toys [[up]] before dinner.']],
  ['separable', 'hand', 'hand in', ['She {{handed}} the essay [[in]] early.', 'You must {{hand}} the form [[in]] today.']],
  ['separable', 'point', 'point out', ['He {{pointed}} the error [[out]] at once.', 'Let me {{point}} one risk [[out]] first.']],
  ['separable', 'figure', 'figure out', ['We {{figured}} the answer [[out]] together.', 'She could not {{figure}} the lock [[out]].']],
  ['separable', 'write', 'write down', ['I {{wrote}} the address [[down]] immediately.', 'Please {{write}} every expense [[down]].']],
  ['separable', 'throw', 'throw away', ['He {{threw}} the receipt [[away]] by mistake.', 'Do not {{throw}} those notes [[away]].']],
  ['phrasal', 'fall', 'fall back on', ['We can {{fall}} [[back]] [[on]] savings in an emergency.', 'She {{fell}} [[back]] [[on]] her old routine.']],
  ['phrasal', 'stay', 'stay on top of', ['You must {{stay}} [[on]] [[top]] [[of]] the deadlines.', 'He {{stayed}} [[on]] [[top]] [[of]] every change.']],
  ['phrasal', 'look', 'look forward to', ['I {{look}} [[forward]] [[to]] your reply.', 'They are {{looking}} [[forward]] [[to]] the holiday.']],
  ['phrasal', 'come', 'come up with', ['She {{came}} [[up]] [[with]] a practical solution.', 'Can you {{come}} [[up]] [[with]] another name?']],
  ['phrasal', 'get', 'get away with', ['He cannot {{get}} [[away]] [[with]] that excuse.', 'They {{got}} [[away]] [[with]] cheating for years.']],
  ['phrasal', 'run', 'run out of', ['We {{ran}} [[out]] [[of]] clean water.', 'The printer may {{run}} [[out]] [[of]] ink.']],
  ['phrasal', 'catch', 'catch up with', ['I need to {{catch}} [[up]] [[with]] the class.', 'She {{caught}} [[up]] [[with]] her old friend.']],
  ['phrasal', 'go', 'go through with', ['They {{went}} [[through]] [[with]] the difficult plan.', 'Will you {{go}} [[through]] [[with]] the purchase?']],
  ['phrasal', 'stand', 'stand up for', ['She {{stood}} [[up]] [[for]] her colleague.', 'We should {{stand}} [[up]] [[for]] what is right.']],
  ['phrasal', 'keep', 'keep up with', ['He cannot {{keep}} [[up]] [[with]] the workload.', 'They {{kept}} [[up]] [[with]] rapid demand.']],
  ['phrasal', 'get', 'get along with', ['I {{get}} [[along]] [[with]] my neighbors.', 'She {{got}} [[along]] [[with]] the new manager.']],
  ['phrasal', 'break', 'break out of', ['The horse {{broke}} [[out]] [[of]] the enclosure.', 'He tried to {{break}} [[out]] [[of]] the routine.']],
  ['phrasal', 'settle', 'settle for', ['Do not {{settle}} [[for]] a weak compromise.', 'They {{settled}} [[for]] the cheaper model.']],
  ['phrasal', 'account', 'account for', ['Exports {{account}} [[for]] half of the revenue.', 'How do you {{account}} [[for]] the missing cash?']],
  ['phrasal', 'deal', 'deal with', ['We must {{deal}} [[with]] the complaint today.', 'She {{dealt}} [[with]] the crisis calmly.']],
  ['idiom', 'take', 'take into account', ['Please {{take}} the criticism [[into]] [[account]].', 'The judge {{took}} his age [[into]] [[account]].']],
  ['idiom', 'sweep', 'sweep under the rug', ['They tried to {{sweep}} the scandal [[under]] [[the]] [[rug]].', 'Do not {{sweep}} these failures [[under]] [[the]] [[rug]].']],
  ['idiom', 'cut', 'cut corners', ['The contractor {{cut}} [[corners]] on safety.', 'We cannot {{cut}} [[corners]] during testing.']],
  ['idiom', 'take', 'take for granted', ['Never {{take}} your health [[for]] [[granted]].', 'She {{took}} his support [[for]] [[granted]].']],
  ['idiom', 'slip', 'slip through the cracks', ['Several requests {{slipped}} [[through]] [[the]] [[cracks]].', 'A quiet student can {{slip}} [[through]] [[the]] [[cracks]].']],
  ['idiom', 'draw', 'draw the line', ['We must {{draw}} [[the]] [[line]] at personal attacks.', 'She {{drew}} [[the]] [[line]] before the final demand.']],
  ['idiom', 'pull', 'pull off', ['The small team {{pulled}} the launch [[off]].', 'Can they {{pull}} this rescue [[off]]?']],
  ['idiom', 'break', 'break the ice', ['A joke helped {{break}} [[the]] [[ice]].', 'He {{broke}} [[the]] [[ice]] with a question.']],
  ['idiom', 'hit', 'hit the nail on the head', ['Your comment {{hit}} [[the]] [[nail]] [[on]] [[the]] [[head]].', 'She {{hit}} [[the]] [[nail]] [[on]] [[the]] [[head]] with that diagnosis.']],
  ['idiom', 'let', 'let the cat out of the bag', ['Ben {{let}} [[the]] [[cat]] [[out]] [[of]] [[the]] [[bag]] yesterday.', 'Do not {{let}} [[the]] [[cat]] [[out]] [[of]] [[the]] [[bag]].']],
  ['idiom', 'be', 'be on the same page', ['We need to {{be}} [[on]] [[the]] [[same]] [[page]] before signing.', 'They [[are]] finally {{on}} [[the]] [[same]] [[page]] about costs.']],
  ['idiom', 'be', 'be under the weather', ['I {{was}} [[under]] [[the]] [[weather]] all weekend.', 'She seems to {{be}} [[under]] [[the]] [[weather]] today.']],
  ['idiom', 'bite', 'bite the bullet', ['We must {{bite}} [[the]] [[bullet]] and begin.', 'He {{bit}} [[the]] [[bullet]] and paid the fee.']],
  ['idiom', 'miss', 'miss the boat', ['They {{missed}} [[the]] [[boat]] on electric cars.', 'Act now or you will {{miss}} [[the]] [[boat]].']],
  ['idiom', 'add', 'add fuel to the fire', ['His accusation {{added}} [[fuel]] [[to]] [[the]] [[fire]].', 'Do not {{add}} [[fuel]] [[to]] [[the]] [[fire]] with rumors.']],
  ['idiom', 'cost', 'cost an arm and a leg', ['The repairs {{cost}} [[an]] [[arm]] [[and]] [[a]] [[leg]].', 'That apartment will {{cost}} [[an]] [[arm]] [[and]] [[a]] [[leg]].']],
  ['variable-slot', 'feather', "a feather in one's cap", ['Winning was [[a]] {{feather}} [[in]] your [[cap]].', 'The award is [[a]] {{feather}} [[in]] her [[cap]].']],
  ['variable-slot', 'keep', 'keep an eye on', ['Please {{keep}} [[an]] [[eye]] [[on]] the soup.', 'She {{kept}} [[an]] [[eye]] [[on]] her luggage.']],
  ['variable-slot', 'make', "make up one's mind", ['You must {{make}} [[up]] your [[mind]] soon.', 'He {{made}} [[up]] his [[mind]] after lunch.']],
  ['variable-slot', 'get', "get on one's nerves", ['That buzzing {{gets}} [[on]] my [[nerves]].', 'His complaints {{got}} [[on]] her [[nerves]].']],
  ['variable-slot', 'have', 'have something in common', ['We {{have}} a lot [[in]] [[common]].', 'The twins {{had}} little [[in]] [[common]].']],
  ['variable-slot', 'take', 'take someone by surprise', ['The result {{took}} everyone [[by]] [[surprise]].', 'Her visit {{took}} me [[by]] [[surprise]].']],
  ['variable-slot', 'lose', "lose one's temper", ['He {{lost}} his [[temper]] during the call.', 'Try not to {{lose}} your [[temper]].']],
  ['fixed-function', 'policy', 'policy of benign neglect', ['They adopted a {{policy}} [[of]] [[benign]] [[neglect]].', 'The report criticized the {{policy}} [[of]] [[benign]] [[neglect]].']],
  ['fixed-function', 'point', 'point of no return', ['We passed the {{point}} [[of]] [[no]] [[return]].', 'The project is near the {{point}} [[of]] [[no]] [[return]].']],
  ['fixed-function', 'state', 'state of the art', ['The lab uses {{state}} [[of]] [[the]] [[art]] equipment.', 'Their scanner is {{state}} [[of]] [[the]] [[art]].']],
  ['fixed-function', 'rule', 'rule of thumb', ['As a {{rule}} [[of]] [[thumb]], save ten percent.', 'This {{rule}} [[of]] [[thumb]] works well.']],
  ['fixed-function', 'light', 'in light of', ['[[In]] {{light}} [[of]] the evidence, we withdrew.', 'The policy changed [[in]] {{light}} [[of]] new data.']],
  ['fixed-function', 'means', 'by means of', ['The door opened [[by]] {{means}} [[of]] a hidden switch.', 'They communicated [[by]] {{means}} [[of]] signals.']],
  ['fixed-function', 'terms', 'in terms of', ['[[In]] {{terms}} [[of]] cost, this wins.', 'The plan is strong [[in]] {{terms}} [[of]] safety.']],
  ['fixed-function', 'result', 'as a result of', ['[[As]] [[a]] {{result}} [[of]] the storm, flights stopped.', 'Prices rose [[as]] [[a]] {{result}} [[of]] shortages.']],
  ['fixed-function', 'behalf', 'on behalf of', ['I speak [[on]] {{behalf}} [[of]] the entire team.', 'She accepted [[on]] {{behalf}} [[of]] her father.']],
  ['fixed-function', 'sake', 'for the sake of', ['We stayed [[for]] [[the]] {{sake}} [[of]] the children.', 'Please listen [[for]] [[the]] {{sake}} [[of]] fairness.']],
  ['fixed-function', 'phase', 'phase out', ['The company will {{phase}} coal [[out]] by 2030.', 'They {{phased}} the old system [[out]] gradually.']],
];

const negativeGroups = [
  ['look', 'look', ['She {{looked}} at the painting for an hour.', 'Please {{look}} at the final column.']],
  ['listen', 'listen', ['We {{listened}} to the rain outside.', 'Please {{listen}} to the instructions.']],
  ['wait', 'wait', ['They {{waited}} for the last bus.', 'I will {{wait}} for your answer.']],
  ['depend', 'depend', ['Success may {{depend}} on careful timing.', 'The price {{depends}} on demand.']],
  ['talk', 'talk', ['She {{talked}} about the new schedule.', 'We should {{talk}} about the budget.']],
  ['think', 'think', ['I {{thought}} about the problem overnight.', 'Please {{think}} about the consequences.']],
  ['belong', 'belong', ['These keys {{belong}} to the landlord.', 'The books {{belonged}} to her aunt.']],
  ['arrive', 'arrive', ['They {{arrived}} at the station early.', 'We {{arrived}} at a quiet village.']],
  ['work', 'work', ['She {{works}} with young children.', 'They {{worked}} with the new software.']],
  ['focus', 'focus', ['The article {{focuses}} on rural schools.', 'We should {{focus}} on the main risk.']],
  ['apply', 'apply', ['This rule {{applies}} to every member.', 'Please {{apply}} for the open position.']],
  ['agree', 'agree', ['I {{agree}} with your conclusion.', 'They {{agreed}} on a final price.']],
  ['refer', 'refer', ['The note {{refers}} to an earlier study.', 'She {{referred}} to the map twice.']],
  ['respond', 'respond', ['He {{responded}} to the email quickly.', 'Markets {{respond}} to uncertainty.']],
  ['care', 'care', ['She {{cares}} about animal welfare.', 'I do not {{care}} about the color.']],
  ['pay', 'pay', ['We {{paid}} for the repairs in cash.', 'He will {{pay}} for lunch today.']],
  ['ask', 'ask', ['She {{asked}} for a glass of water.', 'They {{asked}} for more time.']],
  ['search', 'search', ['Police {{searched}} for the missing bag.', 'We {{searched}} for a better route.']],
  ['change', 'change', ['The weather {{changed}} from rain to snow.', 'She {{changed}} from boots to sandals.']],
  ['move', 'move', ['They {{moved}} toward the exit slowly.', 'The boat {{moved}} across the lake.']],
  ['read', 'read', ['He {{read}} about the discovery yesterday.', 'I {{read}} through the entire report.']],
  ['write', 'write', ['She {{wrote}} about village life.', 'They {{write}} for a national newspaper.']],
  ['learn', 'learn', ['We {{learned}} about cells in class.', 'Children {{learn}} from repeated practice.']],
  ['speak', 'speak', ['He {{spoke}} to the manager privately.', 'She {{speaks}} with a calm voice.']],
  ['walk', 'walk', ['They {{walked}} through the park at noon.', 'I {{walk}} to the office each day.']],
  ['drive', 'drive', ['We {{drove}} through heavy rain.', 'She {{drives}} to work before dawn.']],
  ['sit', 'sit', ['He {{sat}} on the wooden bench.', 'Please {{sit}} near the window.']],
  ['place', 'place', ['She {{placed}} the cup on the table.', 'They {{place}} great value on honesty.']],
  ['compare', 'compare', ['The study {{compared}} cats with dogs.', 'Please {{compare}} the two estimates.']],
  ['protect', 'protect', ['Trees {{protected}} the house from wind.', 'Masks can {{protect}} workers from dust.']],
];

export const lookCases = [
  ...expressionGroups.flatMap(([category, word, canonical, variants], groupIndex) =>
    variants.map((sentence, variantIndex) => markedCase(`expr-${String(groupIndex + 1).padStart(3, '0')}-${variantIndex + 1}`, category, word, canonical, sentence))),
  ...negativeGroups.flatMap(([word, canonical, variants], groupIndex) =>
    variants.map((sentence, variantIndex) => markedCase(`negative-${String(groupIndex + 1).padStart(3, '0')}-${variantIndex + 1}`, 'negative', word, canonical, sentence, 'word'))),
];

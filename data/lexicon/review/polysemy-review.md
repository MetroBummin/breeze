# Targeted polysemy review

This PoC preserves every OEWN sense for the five primary ambiguity probes:
`run` (57), `set` (44), `get` (37), `take` (44), and `charge` (40), for 222
senses in total. Their definitions received the higher-quality local translation
pass. Representative entries and all validation outliers were then checked
against the English gloss and corrected where needed.

Examples of distinctions confirmed during the review:

| Lemma | Sense ID | Korean distinction |
| --- | --- | --- |
| `run` | `run%1:04:01::` | 야구의 득점 |
| `run` | `run%1:04:02::` | 미식축구의 러닝 플레이 |
| `run` | `run%1:04:04::` | 차량·선박의 정기 운행 |
| `set` | `set%1:06:00::` | 무대 세트 |
| `set` | `set%1:06:01::` | 라디오·텔레비전 수상기 |
| `set` | `set%1:09:00::` | 심리적 준비 태세 |
| `get` | `get%1:04:00::` | 스포츠에서 어려운 공을 받아냄 |
| `get` | `get%2:30:03::` | 추상적인 대우·평가를 받음 |
| `get` | `get%2:30:12::` | 행동에 착수함 |
| `take` | `take%1:04:00::` | 중단 없는 한 번의 촬영 |
| `take` | `take%2:35:14::` | 성관계를 갖는다는 고어적 용법 |
| `charge` | `charge%1:04:01::` | 격렬한 돌진 |
| `charge` | `charge%1:06:01::` | 문장학의 방패 문양 |
| `charge` | `charge%1:16:00::` | 정신분석의 카텍시스 |
| `charge` | `charge%2:32:02::` | 잘못을 주장하며 비난함 |

This is a targeted PoC review, not a claim that all 5,715 Korean entries have
received native-speaker lexicographic editing. The remaining quality limitation
is recorded explicitly in `manifest.json` and `README.md`.
